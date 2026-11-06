

import type { PlacedTile } from './board.js';

// ============================================================================

// ============================================================================

export type RegionType = 'Sea' | 'Road' | 'Beach' | 'Lighthouse' | 'Intersection';

export interface IndependentRegionId {

  tileType: string;

  instanceId: number;

  regionType: RegionType;

  regionIndex: number;
}

export interface IndependentEdgeId {

  seaRegionId1: string;

  roadRegionId: string | null;

  seaRegionId2: string;
}

// ============================================================================

// ============================================================================

const instanceCounters = new Map<string, number>();

export function resetInstanceCounters(): void {
  instanceCounters.clear();
}

export function assignInstanceId(tileType: string): number {
  const current = instanceCounters.get(tileType) || 0;
  const next = current + 1;
  instanceCounters.set(tileType, next);
  return next;
}

export function generateIndependentRegionId(
  tileType: string,
  instanceId: number,
  regionType: RegionType,
  regionIndex: number
): string {
  return `${tileType}#${instanceId}#${regionType}#${regionIndex}`;
}

export function parseIndependentRegionId(id: string): IndependentRegionId | null {
  const parts = id.split('#');
  if (parts.length !== 4) return null;

  const [tileType, instanceStr, regionType, indexStr] = parts;
  const instanceId = parseInt(instanceStr, 10);
  const regionIndex = parseInt(indexStr, 10);

  if (isNaN(instanceId) || isNaN(regionIndex)) return null;

  return {
    tileType,
    instanceId,
    regionType: regionType as RegionType,
    regionIndex,
  };
}

export function generateIndependentEdgeId(
  seaRegionId1: string,
  roadRegionId: string | null,
  seaRegionId2: string
): string {
  const roadPart = roadRegionId ?? 'none';
  return `${seaRegionId1}:${roadPart}:${seaRegionId2}`;
}

export function parseIndependentEdgeId(id: string): IndependentEdgeId | null {
  const parts = id.split(':');
  if (parts.length !== 3) return null;

  const [seaRegionId1, roadRegionId, seaRegionId2] = parts;
  return {
    seaRegionId1,
    roadRegionId: roadRegionId === 'none' ? null : roadRegionId,
    seaRegionId2,
  };
}

// ============================================================================

// ============================================================================

export function generateRegionIdsForTile(
  placedTile: PlacedTile,
  originalRegionIds: string[]
): Map<string, string> {
  const tileType = placedTile.data.label;
  const instanceId = placedTile.instanceId;
  const mapping = new Map<string, string>();

  const regionTypeGroups = new Map<RegionType, string[]>();

  for (const originalId of originalRegionIds) {

    const regionType = parseRegionTypeFromId(originalId);
    if (!regionTypeGroups.has(regionType)) {
      regionTypeGroups.set(regionType, []);
    }
    regionTypeGroups.get(regionType)!.push(originalId);
  }

  for (const [regionType, regionIds] of regionTypeGroups) {

    regionIds.sort((a, b) => {
      const numA = parseInt(a.split('-')[1] || '0', 10);
      const numB = parseInt(b.split('-')[1] || '0', 10);
      return numA - numB;
    });

    regionIds.forEach((originalId, index) => {
      const independentId = generateIndependentRegionId(
        tileType,
        instanceId,
        regionType,
        index
      );
      mapping.set(originalId, independentId);
    });
  }

  return mapping;
}

function parseRegionTypeFromId(regionId: string): RegionType {
  if (regionId.startsWith('sea-')) return 'Sea';
  if (regionId.startsWith('road-')) return 'Road';
  if (regionId.startsWith('beach-')) return 'Beach';
  if (regionId.startsWith('lighthouse')) return 'Lighthouse';
  return 'Intersection';
}

export function getRegionIdMapping(placedTile: PlacedTile): Map<string, string> {
  if (!placedTile.regionIdMapping) {
    return new Map();
  }

  return new Map(JSON.parse(placedTile.regionIdMapping));
}

export function setRegionIdMapping(
  placedTile: PlacedTile,
  mapping: Map<string, string>
): void {
  placedTile.regionIdMapping = JSON.stringify(Array.from(mapping.entries()));
}

export function toIndependentRegionId(
  placedTile: PlacedTile,
  originalRegionId: string
): string | null {
  const mapping = getRegionIdMapping(placedTile);
  return mapping.get(originalRegionId) ?? null;
}

export function getIndependentRegionId(
  placedTile: PlacedTile,
  originalRegionId: string
): string {
  const mapping = getRegionIdMapping(placedTile);
  return mapping.get(originalRegionId) ?? originalRegionId;
}

export function toIndependentRegionIds(
  placedTile: PlacedTile,
  originalRegionIds: string[]
): string[] {
  const mapping = getRegionIdMapping(placedTile);
  return originalRegionIds.map(id => mapping.get(id) ?? id);
}

export function syncInstanceCounters(placedTiles: PlacedTile[]): void {

  instanceCounters.clear();

  const maxInstances = new Map<string, number>();

  for (const tile of placedTiles) {
    const tileType = tile.data.label;
    const currentMax = maxInstances.get(tileType) || 0;
    if (tile.instanceId > currentMax) {
      maxInstances.set(tileType, tile.instanceId);
    }
  }

  for (const [tileType, maxId] of maxInstances) {
    instanceCounters.set(tileType, maxId);
  }
}

export function getInstanceCounters(): Record<string, number> {
  return Object.fromEntries(instanceCounters);
}

// ============================================================================

// ============================================================================

export function getEdgeIndependentId(
  placedTile: PlacedTile,
  edgeIndex: number,
  edgeType: EdgeType
): string {
  const tileType = placedTile.data.label;
  const instanceId = placedTile.instanceId;

  const mapping = getRegionIdMapping(placedTile);

  let regionId: string | null = null;

  for (const [originalId, independentId] of mapping) {

    if (regionTouchesEdge(originalId, edgeIndex, placedTile)) {
      const parsed = parseIndependentRegionId(independentId);
      if (parsed && parsed.regionType === edgeType) {
        regionId = independentId;
        break;
      }
    }
  }

  if (!regionId) {

    regionId = generateIndependentRegionId(tileType, instanceId, edgeType as RegionType, edgeIndex);
  }

  return regionId;
}

function regionTouchesEdge(
  /* eslint-disable @typescript-eslint/no-unused-vars */
  _regionId: string,
  _edgeIndex: number,
  _placedTile: PlacedTile
  /* eslint-enable @typescript-eslint/no-unused-vars */
): boolean {

  return true;
}

type EdgeType = 'Sea' | 'Road' | 'Beach';

export function getAllEdgeIndependentIds(
  placedTile: PlacedTile
): [string, string, string, string] {
  const rotatedEdges = getRotatedEdgeTypes(placedTile.data, placedTile.rotation);
  return [
    getEdgeIndependentId(placedTile, 0, rotatedEdges[0]),
    getEdgeIndependentId(placedTile, 1, rotatedEdges[1]),
    getEdgeIndependentId(placedTile, 2, rotatedEdges[2]),
    getEdgeIndependentId(placedTile, 3, rotatedEdges[3]),
  ];
}

function getRotatedEdgeTypes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tileData: any,
  rotation: number
): [EdgeType, EdgeType, EdgeType, EdgeType] {
  const steps = ((rotation % 360) + 360) % 360 / 90;
  const edges = [...tileData.edges] as [EdgeType, EdgeType, EdgeType, EdgeType];
  for (let i = 0; i < steps; i++) {
    const [t, r, b, l] = edges;
    edges[0] = l;
    edges[1] = t;
    edges[2] = r;
    edges[3] = b;
  }
  return edges;
}

// ============================================================================

// ============================================================================

export function areEdgesCompatible(
  tile1: PlacedTile,
  edge1: number,
  tile2: PlacedTile,
  edge2: number
): boolean {
  const edgeType1 = getRotatedEdgeTypes(tile1.data, tile1.rotation)[edge1];
  const edgeType2 = getRotatedEdgeTypes(tile2.data, tile2.rotation)[edge2];
  return edgeType1 === edgeType2;
}

export function getConnectedRegionsBetweenTiles(
  tile1: PlacedTile,
  edge1: number,
  tile2: PlacedTile,
  edge2: number
): Array<{ from: string; to: string; type: RegionType }> {
  const connections: Array<{ from: string; to: string; type: RegionType }> = [];

  const edgeType1 = getRotatedEdgeTypes(tile1.data, tile1.rotation)[edge1];
  const edgeType2 = getRotatedEdgeTypes(tile2.data, tile2.rotation)[edge2];

  if (edgeType1 !== edgeType2) {
    return connections;
  }

  const id1 = getEdgeIndependentId(tile1, edge1, edgeType1);
  const id2 = getEdgeIndependentId(tile2, edge2, edgeType2);

  connections.push({
    from: id1,
    to: id2,
    type: edgeType1 as RegionType,
  });

  return connections;
}
