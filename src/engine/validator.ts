import { Board } from './board.js';
import type { PlacedTile } from './board.js';
import type { TileData, EdgeType } from '../data/tiles.js';
import { getRotatedRegions } from '../data/tiles.js';
import { findFeature } from './scoring.js';
import {
  getIndependentRegionId,
} from './regionId.js';

export function getEdge(tile: TileData, rotation: number, edgeIdx: number): EdgeType {
  const steps = ((rotation % 360) + 360) % 360 / 90;
  const originalIdx = (edgeIdx - steps + 4) % 4;
  return tile.edges[originalIdx];
}

export function getRotatedEdges(edges: [EdgeType, EdgeType, EdgeType, EdgeType], rotation: number): [EdgeType, EdgeType, EdgeType, EdgeType] {
  const steps = ((rotation % 360) / 90) | 0;
  let [t, r, b, l] = edges;
  for (let i = 0; i < steps; i++) {
    [t, r, b, l] = [l, t, r, b];
  }
  return [t, r, b, l];
}

export function isValidPlacement(board: Board, x: number, y: number, tile: TileData, rotation: number): boolean {
  if (board.getTile(x, y)) return false;

  const neighbors = [
    { x, y: y - 1, edgeIdx: 0, oppIdx: 2 },
    { x: x + 1, y, edgeIdx: 1, oppIdx: 3 },
    { x, y: y + 1, edgeIdx: 2, oppIdx: 0 },
    { x: x - 1, y, edgeIdx: 3, oppIdx: 1 },
  ];

  let hasNeighbor = false;
  for (const n of neighbors) {
    const neighborTile = board.getTile(n.x, n.y);
    if (neighborTile) {
      hasNeighbor = true;
      const myEdge = getEdge(tile, rotation, n.edgeIdx);
      const neighborEdge = getEdge(neighborTile.data, neighborTile.rotation, n.oppIdx);
      if (myEdge !== neighborEdge) return false;
    }
  }

  return hasNeighbor || board.getAllTiles().length === 0;
}

export function canPlaceTileAnywhere(board: Board, tile: TileData): boolean {
  const slots = board.getAvailableSlots();
  if (slots.length === 0) return true;
  for (const slot of slots) {
    for (const rotation of [0, 90, 180, 270]) {
      if (isValidPlacement(board, slot.x, slot.y, tile, rotation)) {
        return true;
      }
    }
  }
  return false;
}

function createBoardWithTentativeTile(board: Board, x: number, y: number, tile: TileData, rotation: number): { board: Board; tile: PlacedTile } {
  const simulatedBoard = new Board();
  const entries = board.getSerializedTiles().map(([key, value]) => [
    key,
    {
      ...value,
      meeple: value.meeple ? { ...value.meeple } : undefined,
      regionIdMapping: value.regionIdMapping,
    }
  ] as [string, PlacedTile]);

  simulatedBoard.restoreFromSerializedTiles(entries);

  const simulatedTile = simulatedBoard.placeTile(x, y, tile, rotation);
  return { board: simulatedBoard, tile: simulatedTile };
}

function computeOccupiableRegionIds(
  board: Board,
  placedTile: PlacedTile,
  regions: ReturnType<typeof getRotatedRegions>,
  tileX: number,
  tileY: number
): Set<string> {
  const result = new Set<string>();

  const featureRepresentative = new Map<string, string>();

  const regionFeatureKey = new Map<string, string>();

  const occupiedFeatureKeys = new Set<string>();

  for (const region of regions) {

    if (region.type === 'Intersection') continue;

    if (region.type === 'Lighthouse') {
      result.add(region.id);
      continue;
    }

    const feature = findFeature(board, placedTile, region.id);

    const featureKey = feature.regions
      .map(fr => fr.independentRegionId)
      .sort()
      .join('|');

    regionFeatureKey.set(region.id, featureKey);

    const occupied = feature.regions.some(fr => {
      if (!fr.tile.meeple) return false;
      if (fr.tile.meeple.regionId !== fr.region.id) return false;

      if (fr.tile.x === tileX && fr.tile.y === tileY && fr.region.id === region.id) {
        return false;
      }
      return true;
    });

    if (occupied) {
      occupiedFeatureKeys.add(featureKey);
    }

    const current = featureRepresentative.get(featureKey);
    if (!current || region.id < current) {
      featureRepresentative.set(featureKey, region.id);
    }
  }

  for (const region of regions) {
    if (region.type === 'Intersection' || region.type === 'Lighthouse') continue;
    const featureKey = regionFeatureKey.get(region.id);
    if (!featureKey) continue;
    if (occupiedFeatureKeys.has(featureKey)) continue;
    if (featureRepresentative.get(featureKey) === region.id) {
      result.add(region.id);
    }
  }

  return result;
}

export function getTentativeOccupiableRegionIds(board: Board, x: number, y: number, tile: TileData, rotation: number): Set<string> {
  const simulated = createBoardWithTentativeTile(board, x, y, tile, rotation);
  const regions = getRotatedRegions(tile.label, rotation);
  return computeOccupiableRegionIds(simulated.board, simulated.tile, regions, x, y);
}

export function getOccupiableRegionIds(board: Board, tile: PlacedTile): Set<string> {
  const regions = getRotatedRegions(tile.data.label, tile.rotation);
  return computeOccupiableRegionIds(board, tile, regions, tile.x, tile.y);
}

export function isFeatureOccupied(board: Board, tile: PlacedTile, regionId: string): boolean {
  const rotatedRegions = getRotatedRegions(tile.data.label, tile.rotation);
  const startRegion = rotatedRegions.find(r => r.id === regionId);
  if (!startRegion) return false;

  const type = startRegion.type;
  if (type === 'Lighthouse' || type === 'Intersection') return false;

  const feature = findFeature(board, tile, regionId);

  const currentIndependentId = getIndependentRegionId(tile, regionId);

  return feature.regions.some(fr => {
    if (!fr.tile.meeple) return false;
    if (fr.tile.meeple.regionId !== fr.region.id) return false;

    const frIndependentId = getIndependentRegionId(fr.tile, fr.region.id);
    return frIndependentId !== currentIndependentId;
  });
}
