import { Board } from './board.js';
import type { PlacedTile } from './board.js';
import { getRotatedRegions } from '../data/tiles.js';
import type { TileRegion } from '../data/tiles.js';
import {
  getIndependentRegionId,
} from './regionId.js';

export interface FeatureRegion {
  tile: PlacedTile;
  region: TileRegion;

  independentRegionId: string;
}

export interface Feature {
  type: string;
  regions: FeatureRegion[];
  isCompleted: boolean;
  meeples: { playerId: number; count: number }[];
}

export const F_EDGE_DIR: Record<number, { dx: number; dy: number; opposite: number; edgeIndex: number }> = {
  0: { dx: 0, dy: -1, opposite: 5, edgeIndex: 0 },
  1: { dx: 0, dy: -1, opposite: 4, edgeIndex: 0 },
  2: { dx: 1, dy: 0,  opposite: 7, edgeIndex: 1 },
  3: { dx: 1, dy: 0,  opposite: 6, edgeIndex: 1 },
  4: { dx: 0, dy: 1,  opposite: 1, edgeIndex: 2 },
  5: { dx: 0, dy: 1,  opposite: 0, edgeIndex: 2 },
  6: { dx: -1, dy: 0, opposite: 3, edgeIndex: 3 },
  7: { dx: -1, dy: 0, opposite: 2, edgeIndex: 3 },
};

interface SeaCluster {
  id: string;
  seaRegionIds: Set<string>;
  adjacentBeachIds: Set<string>;
  meeples: { playerId: number; count: number }[];
  ownerPlayerId?: number;
}

interface BeachCluster {
  id: string;
  beachRegionIds: Set<string>;
  isCompleted: boolean;
  meeples: { playerId: number; count: number }[];
  ownerPlayerId?: number;
}

export class SeaBeachTracker {

  private seaToCluster: Map<string, string> = new Map();

  private beachToCluster: Map<string, string> = new Map();

  private regionToTileCoord: Map<string, { x: number; y: number }> = new Map();

  private seaClusters: Map<string, SeaCluster> = new Map();
  private beachClusters: Map<string, BeachCluster> = new Map();

  private nextSeaClusterId = 1;
  private nextBeachClusterId = 1;

  updateOnTilePlaced(tile: PlacedTile, board: Board): void {
    const regions = getRotatedRegions(tile.data.label, tile.rotation);

    for (const region of regions) {
      const independentId = getIndependentRegionId(tile, region.id);

      this.regionToTileCoord.set(independentId, { x: tile.x, y: tile.y });

      if (region.type === 'Sea') {
        this.createSeaClusterIfNeeded(independentId, tile, region);
      } else if (region.type === 'Beach') {
        this.createBeachClusterIfNeeded(independentId, tile, region);
      }
    }

    this.mergeConnectedSeaClusters(tile, board);

    this.mergeConnectedBeachClusters(tile, board);

    this.collectAdjacentBeaches(tile);

    this.updateOwnerInfo(tile);
  }

  private createSeaClusterIfNeeded(independentId: string, _tile: PlacedTile, _region: TileRegion): void {
    if (this.seaToCluster.has(independentId)) return;

    const clusterId = `sea_cluster_${this.nextSeaClusterId++}`;
    this.seaToCluster.set(independentId, clusterId);

    this.seaClusters.set(clusterId, {
      id: clusterId,
      seaRegionIds: new Set([independentId]),
      adjacentBeachIds: new Set(),
      meeples: [],
    });
  }

  private createBeachClusterIfNeeded(independentId: string, _tile: PlacedTile, _region: TileRegion): void {
    if (this.beachToCluster.has(independentId)) return;

    const clusterId = `beach_cluster_${this.nextBeachClusterId++}`;
    this.beachToCluster.set(independentId, clusterId);

    this.beachClusters.set(clusterId, {
      id: clusterId,
      beachRegionIds: new Set([independentId]),
      isCompleted: false,
      meeples: [],
    });
  }

  private mergeConnectedSeaClusters(tile: PlacedTile, board: Board): void {
    const regions = getRotatedRegions(tile.data.label, tile.rotation);
    const seaRegions = regions.filter(r => r.type === 'Sea');

    for (const seaRegion of seaRegions) {
      const seaId = getIndependentRegionId(tile, seaRegion.id);
      const currentClusterId = this.seaToCluster.get(seaId);
      if (!currentClusterId) continue;

      const halfEdges = getHalfEdges(seaRegion);

      for (const fEdge of halfEdges) {
        const dir = F_EDGE_DIR[fEdge];
        const nx = tile.x + dir.dx;
        const ny = tile.y + dir.dy;

        const neighborTile = board.getTile(nx, ny);
        if (!neighborTile) {
          continue;
        }

        const neighborRegions = getRotatedRegions(neighborTile.data.label, neighborTile.rotation);
        const oppositeFEdge = dir.opposite;

        for (const neighborRegion of neighborRegions) {
          if (neighborRegion.type !== 'Sea') continue;

          if (regionTouchesHalfEdge(neighborRegion, oppositeFEdge)) {
            const neighborSeaId = getIndependentRegionId(neighborTile, neighborRegion.id);
            const neighborClusterId = this.seaToCluster.get(neighborSeaId);

            if (neighborClusterId && neighborClusterId !== currentClusterId) {

              this.mergeSeaClusters(currentClusterId, neighborClusterId);
            }
          }
        }
      }
    }
  }

  private mergeConnectedBeachClusters(tile: PlacedTile, board: Board): void {
    const regions = getRotatedRegions(tile.data.label, tile.rotation);
    const beachRegions = regions.filter(r => r.type === 'Beach');

    for (const beachRegion of beachRegions) {
      const beachId = getIndependentRegionId(tile, beachRegion.id);
      const currentClusterId = this.beachToCluster.get(beachId);
      if (!currentClusterId) continue;

      const halfEdges = getHalfEdges(beachRegion);
      for (const fEdge of halfEdges) {
        const dir = F_EDGE_DIR[fEdge];
        const nx = tile.x + dir.dx;
        const ny = tile.y + dir.dy;

        const neighborTile = board.getTile(nx, ny);
        if (!neighborTile) continue;

        const neighborRegions = getRotatedRegions(neighborTile.data.label, neighborTile.rotation);
        const oppositeFEdge = dir.opposite;

        for (const neighborRegion of neighborRegions) {
          if (neighborRegion.type !== 'Beach') continue;

          if (regionTouchesHalfEdge(neighborRegion, oppositeFEdge)) {
            const neighborBeachId = getIndependentRegionId(neighborTile, neighborRegion.id);
            const neighborClusterId = this.beachToCluster.get(neighborBeachId);

            if (neighborClusterId && neighborClusterId !== currentClusterId) {

              this.mergeBeachClusters(currentClusterId, neighborClusterId);
            }
          }
        }
      }
    }
  }

  private mergeSeaClusters(clusterId1: string, clusterId2: string): void {
    if (clusterId1 === clusterId2) {
      return;
    }

    const cluster1 = this.seaClusters.get(clusterId1);
    const cluster2 = this.seaClusters.get(clusterId2);

    if (!cluster1 || !cluster2) {
      return;
    }

    cluster2.seaRegionIds.forEach(id => {
      cluster1.seaRegionIds.add(id);
      this.seaToCluster.set(id, clusterId1);
    });

    cluster2.adjacentBeachIds.forEach(id => {
      cluster1.adjacentBeachIds.add(id);
    });

    cluster2.meeples.forEach(m2 => {
      const existingMeeple = cluster1.meeples.find(m1 => m1.playerId === m2.playerId);
      if (existingMeeple) {
        existingMeeple.count += m2.count;
      } else {
        cluster1.meeples.push({ ...m2 });
      }
    });

    if (!cluster1.ownerPlayerId && cluster2.ownerPlayerId) {
      cluster1.ownerPlayerId = cluster2.ownerPlayerId;
    }

    this.seaClusters.delete(clusterId2);
  }

  private mergeBeachClusters(clusterId1: string, clusterId2: string): void {
    if (clusterId1 === clusterId2) return;

    const cluster1 = this.beachClusters.get(clusterId1);
    const cluster2 = this.beachClusters.get(clusterId2);

    if (!cluster1 || !cluster2) return;

    const isCompleted = cluster1.isCompleted || cluster2.isCompleted;

    cluster2.beachRegionIds.forEach(id => {
      cluster1.beachRegionIds.add(id);
      this.beachToCluster.set(id, clusterId1);
    });

    cluster2.meeples.forEach(m2 => {
      const existingMeeple = cluster1.meeples.find(m1 => m1.playerId === m2.playerId);
      if (existingMeeple) {
        existingMeeple.count += m2.count;
      } else {
        cluster1.meeples.push({ ...m2 });
      }
    });

    if (!cluster1.ownerPlayerId && cluster2.ownerPlayerId) {
      cluster1.ownerPlayerId = cluster2.ownerPlayerId;
    }

    cluster1.isCompleted = isCompleted;

    this.beachClusters.delete(clusterId2);
  }

  private collectAdjacentBeaches(tile: PlacedTile): void {
    const regions = getRotatedRegions(tile.data.label, tile.rotation);

    for (const region of regions) {
      if (region.type === 'Sea' && region.adjacentRegions?.beach) {
        const seaId = getIndependentRegionId(tile, region.id);
        const seaClusterId = this.seaToCluster.get(seaId);

        if (!seaClusterId) continue;

        const seaCluster = this.seaClusters.get(seaClusterId);
        if (!seaCluster) continue;

        for (const beachId of region.adjacentRegions.beach) {
          const beachIndependentId = getIndependentRegionId(tile, beachId);
          seaCluster.adjacentBeachIds.add(beachIndependentId);
        }
      }
    }
  }

  updateOwnerInfo(tile: PlacedTile): void {
    if (!tile.meeple) {
      return;
    }

    const independentId = getIndependentRegionId(tile, tile.meeple.regionId);
    const playerId = tile.meeple.playerId;

    const seaClusterId = this.seaToCluster.get(independentId);

    if (seaClusterId) {
      const seaCluster = this.seaClusters.get(seaClusterId);
      if (seaCluster) {

        let playerMeeple = seaCluster.meeples.find(m => m.playerId === playerId);
        if (playerMeeple) {
          playerMeeple.count++;
        } else {
          seaCluster.meeples.push({ playerId, count: 1 });
        }

        if (!seaCluster.ownerPlayerId) {
          seaCluster.ownerPlayerId = playerId;
        }
      }
    }

    const beachClusterId = this.beachToCluster.get(independentId);

    if (beachClusterId) {
      const beachCluster = this.beachClusters.get(beachClusterId);
      if (beachCluster) {

        let playerMeeple = beachCluster.meeples.find(m => m.playerId === playerId);
        if (playerMeeple) {
          playerMeeple.count++;
        } else {
          beachCluster.meeples.push({ playerId, count: 1 });
        }

        if (!beachCluster.ownerPlayerId) {
          beachCluster.ownerPlayerId = playerId;
        }
      }
    }
  }

  markBeachClusterCompleted(beachRegionId: string): void {
    const clusterId = this.beachToCluster.get(beachRegionId);
    if (clusterId) {
      const cluster = this.beachClusters.get(clusterId);
      if (cluster) {
        cluster.isCompleted = true;
      }
    }
  }

  getBeachClusterId(beachRegionId: string): string | undefined {
    return this.beachToCluster.get(beachRegionId);
  }

  calculateFinalSeaScores(): Array<{ playerId: number; points: number }> {
    const results: Array<{ playerId: number; points: number }> = [];

    for (const seaCluster of this.seaClusters.values()) {

      if (seaCluster.meeples.length === 0) {
        continue;
      }

      const scoredBeachClusterIds = new Set<string>();

      for (const beachId of seaCluster.adjacentBeachIds) {
        const beachClusterId = this.beachToCluster.get(beachId);
        if (!beachClusterId) {
          continue;
        }

        const beachCluster = this.beachClusters.get(beachClusterId);
        if (!beachCluster) {
          continue;
        }

        if (!beachCluster.isCompleted) {
          continue;
        }

        if (!scoredBeachClusterIds.has(beachClusterId)) {
          scoredBeachClusterIds.add(beachClusterId);
        }
      }

      const points = scoredBeachClusterIds.size * 3;

      if (points > 0 && seaCluster.meeples.length > 0) {

        const maxMeeples = Math.max(...seaCluster.meeples.map(m => m.count));
        const winners = seaCluster.meeples.filter(m => m.count === maxMeeples);

        winners.forEach(w => {
          results.push({
            playerId: w.playerId,
            points,
          });
        });
      }
    }

    return results;
  }

  seaEvaluationGroups() {
    return [...this.seaClusters.values()].map(sea => ({
      meeples: sea.meeples.map(m => ({...m})),
      beaches: [...new Set([...sea.adjacentBeachIds].map(id=>this.beachToCluster.get(id)).filter((id):id is string=>Boolean(id)))].map(id=>{
        const b=this.beachClusters.get(id)!;
        return {id, completed:b.isCompleted, regionId:[...b.beachRegionIds][0]};
      }),
    }));
  }

  getDebugInfo(): { seaClusters: any[]; beachClusters: any[] } {
    return {
      seaClusters: Array.from(this.seaClusters.values()).map(c => ({
        id: c.id,
        seaRegionIds: Array.from(c.seaRegionIds),
        adjacentBeachIds: Array.from(c.adjacentBeachIds),
        meeples: c.meeples,
        ownerPlayerId: c.ownerPlayerId,
      })),
      beachClusters: Array.from(this.beachClusters.values()).map(c => ({
        id: c.id,
        beachRegionIds: Array.from(c.beachRegionIds),
        isCompleted: c.isCompleted,
        meeples: c.meeples,
        ownerPlayerId: c.ownerPlayerId,
      })),
    };
  }
}

export function getHalfEdges(region: TileRegion): number[] {
  if (region.fEdges && region.fEdges.length > 0) {
    return region.fEdges;
  }
  if (region.edges && region.edges.length > 0) {

    if (region.type === 'Beach') {
      return region.edges.map(e => e * 2);
    }

    return region.edges.flatMap(e => [e * 2, e * 2 + 1]);
  }
  return [];
}

export function regionTouchesHalfEdge(region: TileRegion, halfEdge: number): boolean {
  if (region.fEdges && region.fEdges.length > 0) {
    return region.fEdges.includes(halfEdge);
  }
  if (region.edges && region.edges.length > 0) {

    if (region.type === 'Beach') {
      const edgeForHalfEdge = Math.floor(halfEdge / 2);
      return region.edges.includes(edgeForHalfEdge);
    }

    const edgeForHalfEdge = Math.floor(halfEdge / 2);
    return region.edges.includes(edgeForHalfEdge);
  }
  return false;
}

function getSameTileConnectedRegions(
  tileRegions: TileRegion[],
  currentRegion: TileRegion,
  type: string
): TileRegion[] {
  const connected: TileRegion[] = [];

  if (type === 'Beach') {
    const myEdges = new Set(currentRegion.edges);
    for (const other of tileRegions) {
      if (other.id === currentRegion.id) continue;
      if (other.type !== type) continue;
      const hasSharedEdge = other.edges.some(e => myEdges.has(e));
      if (hasSharedEdge) {
        connected.push(other);
      }
    }
    return connected;
  }

  if (type === 'Sea') {
    const myFEdges = currentRegion.fEdges || [];
    const myEdges = new Set(currentRegion.edges);

    for (const other of tileRegions) {
      if (other.id === currentRegion.id) continue;
      if (other.type !== type) continue;

      const otherFEdges = other.fEdges || [];
      const otherEdges = new Set(other.edges);

      if (myEdges.size > 0 && otherEdges.size > 0) {
        const hasSharedEdge = [...myEdges].some(e => otherEdges.has(e));
        if (hasSharedEdge) {
          let complementaryEdgeCount = 0;

          for (const edgeIdx of myEdges) {
            if (!otherEdges.has(edgeIdx)) continue;

            const leftHalf = edgeIdx * 2;
            const rightHalf = edgeIdx * 2 + 1;

            const myHasLeft = myFEdges.includes(leftHalf);
            const myHasRight = myFEdges.includes(rightHalf);
            const otherHasLeft = otherFEdges.includes(leftHalf);
            const otherHasRight = otherFEdges.includes(rightHalf);

            if ((myHasLeft && otherHasRight) || (myHasRight && otherHasLeft)) {
              complementaryEdgeCount++;
            }
          }

          if (complementaryEdgeCount >= 1) {
            connected.push(other);
          }
        }
      }

    }
  }

  return connected;
}

function getConnectedRegionsAtHalfEdge(
  tile1: PlacedTile,
  region1: TileRegion,
  halfEdge: number,
  tile2: PlacedTile
): { fromRegionId: string; toRegionId: string; toRegion: TileRegion } | null {
  const dir = F_EDGE_DIR[halfEdge];
  const oppHalfEdge = dir.opposite;

  const regions2 = getRotatedRegions(tile2.data.label, tile2.rotation);

  const type1 = region1.type;
  const fromIndependentId = getIndependentRegionId(tile1, region1.id);

  for (const region2 of regions2) {
    if (region2.type !== type1) continue;
    if (!regionTouchesHalfEdge(region2, oppHalfEdge)) continue;

    const toIndependentId = getIndependentRegionId(tile2, region2.id);
    return {
      fromRegionId: fromIndependentId,
      toRegionId: toIndependentId,
      toRegion: region2,
    };
  }

  return null;
}

export function findFeature(board: Board, startTile: PlacedTile, startRegionId: string): Feature {
  const regions: FeatureRegion[] = [];
  const visitedIndependentIds = new Set<string>();
  const queue: Array<{ x: number; y: number; regionId: string }> = [];

  const startRegions = getRotatedRegions(startTile.data.label, startTile.rotation);
  const startReg = startRegions.find(r => r.id === startRegionId);
  if (!startReg) return { type: 'Unknown', regions: [], isCompleted: false, meeples: [] };

  const type = startReg.type;
  const startIndependentId = getIndependentRegionId(startTile, startRegionId);

  queue.push({ x: startTile.x, y: startTile.y, regionId: startRegionId });
  visitedIndependentIds.add(startIndependentId);

  let isCompleted = true;

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currTile = board.getTile(curr.x, curr.y);
    if (!currTile) continue;

    const myRegs = getRotatedRegions(currTile.data.label, currTile.rotation);
    const mReg = myRegs.find(r => r.id === curr.regionId);
    if (!mReg) continue;

    const currIndependentId = getIndependentRegionId(currTile, curr.regionId);

    regions.push({
      tile: currTile,
      region: mReg,
      independentRegionId: currIndependentId,
    });

    const internalConnected = getSameTileConnectedRegions(myRegs, mReg, type);
    for (const ic of internalConnected) {
      const icIndependentId = getIndependentRegionId(currTile, ic.id);
      if (!visitedIndependentIds.has(icIndependentId)) {
        visitedIndependentIds.add(icIndependentId);
        queue.push({ x: curr.x, y: curr.y, regionId: ic.id });
      }
    }

    const halfEdges = getHalfEdges(mReg);
    const checkedDirections = new Set<string>();

    for (const fe of halfEdges) {
      const dir = F_EDGE_DIR[fe];
      const nx = curr.x + dir.dx;
      const ny = curr.y + dir.dy;
      const dirKey = `${nx},${ny}`;

      const neighborTile = board.getTile(nx, ny);

      if (!neighborTile) {
        if (!checkedDirections.has(dirKey)) {
          isCompleted = false;
        }
        checkedDirections.add(dirKey);
      } else {

        const connection = getConnectedRegionsAtHalfEdge(
          currTile,
          mReg,
          fe,
          neighborTile
        );

        if (connection) {
          if (!visitedIndependentIds.has(connection.toRegionId)) {
            visitedIndependentIds.add(connection.toRegionId);
            queue.push({ x: nx, y: ny, regionId: connection.toRegion.id });
          }
        }
      }
    }
  }

  const meepleMap: Record<number, number> = {};
  regions.forEach(fr => {
    if (fr.tile.meeple && fr.tile.meeple.regionId === fr.region.id) {
      meepleMap[fr.tile.meeple.playerId] = (meepleMap[fr.tile.meeple.playerId] || 0) + 1;
    }
  });

  const meeples = Object.entries(meepleMap).map(([id, count]) => ({
    playerId: parseInt(id),
    count
  }));

  return { type, regions, isCompleted, meeples };
}

export function checkLighthouse(board: Board, tile: PlacedTile): { isCompleted: boolean; score: number } {
  let count = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      if (board.getTile(tile.x + dx, tile.y + dy)) {
        count++;
      }
    }
  }
  return { isCompleted: count === 8, score: count + 1 };
}

export function calculateScore(feature: Feature, isFinal = false): number {
  void isFinal;
  const uniqueTileKeys = new Set(feature.regions.map(r => `${r.tile.x},${r.tile.y}`));
  const tileCount = uniqueTileKeys.size;

  if (feature.type === 'Road') {
    return tileCount;
  }
  if (feature.type === 'Beach') {
    return isFinal ? tileCount : tileCount * 2;
  }
  return 0;
}

export function calculateSeaScore(board: Board, seaFeature: Feature): number {

  const seaHalfEdges = new Set<string>();

  for (const fr of seaFeature.regions) {
    const tile = fr.tile;
    const regions = getRotatedRegions(tile.data.label, tile.rotation);
    const seaRegion = regions.find(r => r.id === fr.region.id);
    if (!seaRegion) continue;

    const halfEdges = getHalfEdges(seaRegion);
    for (const fEdge of halfEdges) {
      const key = `${tile.x},${tile.y},${fEdge}`;
      seaHalfEdges.add(key);
    }
  }

  const adjacentClosedBeachKeys = new Set<string>();
  const checkedBeachRegions = new Set<string>();

  for (const seaEdgeKey of seaHalfEdges) {
    const [xStr, yStr, fEdgeIdxStr] = seaEdgeKey.split(',');
    const x = parseInt(xStr, 10);
    const y = parseInt(yStr, 10);
    const fEdgeIdx = parseInt(fEdgeIdxStr, 10);

    const dir = F_EDGE_DIR[fEdgeIdx];
    const nx = x + dir.dx;
    const ny = y + dir.dy;

    const neighborTile = board.getTile(nx, ny);
    if (!neighborTile) continue;

    const neighborRegions = getRotatedRegions(neighborTile.data.label, neighborTile.rotation);

    for (const beachRegion of neighborRegions) {
      if (beachRegion.type !== 'Beach') continue;

      const beachKey = `${nx},${ny},${beachRegion.id}`;
      if (checkedBeachRegions.has(beachKey)) continue;
      checkedBeachRegions.add(beachKey);

      const beachFeature = findFeature(board, neighborTile, beachRegion.id);
      if (beachFeature.isCompleted) {

        const sortedTiles = beachFeature.regions
          .map(br => `${br.tile.x},${br.tile.y}`)
          .sort()
          .join('|');

        adjacentClosedBeachKeys.add(sortedTiles);
      }
    }
  }

  const adjacentClosedBeachesCount = adjacentClosedBeachKeys.size;
  const score = adjacentClosedBeachesCount * 3;

  return score;
}
