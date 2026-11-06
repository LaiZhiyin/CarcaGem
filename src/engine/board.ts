import type { TileData } from '../data/tiles.js';
import { TILE_REGIONS } from '../data/tiles.js';
import {
  generateRegionIdsForTile,
  setRegionIdMapping,
} from './regionId.js';

export interface PlacedTile {
  x: number;
  y: number;
  data: TileData;
  rotation: number; // 0, 90, 180, 270
  placedBy?: number;

  instanceId: number;

  regionIdMapping?: string;
  meeple?: {
    playerId: number;
    regionId: string;

    independentRegionId?: string;
  };
}

export class Board {
  private tiles: Map<string, PlacedTile> = new Map();
  private minX = 0;
  private maxX = 0;
  private minY = 0;
  private maxY = 0;

  placeTile(x: number, y: number, data: TileData, rotation: number, placedBy?: number): PlacedTile {

    // Scope IDs to this board: multiple server rooms and simulated boards must be independent.
    const instanceId = this.getAllTiles().reduce((max, tile) =>
      tile.data.label === data.label ? Math.max(max, tile.instanceId) : max, 0) + 1;

    const originalRegionIds = TILE_REGIONS[data.label]?.map(r => r.id) ?? [];
    const regionIdMapping = generateRegionIdsForTile(
      { x, y, data, rotation, placedBy, instanceId } as PlacedTile,
      originalRegionIds
    );

    const pt: PlacedTile = { x, y, data, rotation, placedBy, instanceId };
    setRegionIdMapping(pt, regionIdMapping);

    this.tiles.set(`${x},${y}`, pt);
    this.updateBounds(x, y);
    return pt;
  }

  getTile(x: number, y: number): PlacedTile | undefined {
    return this.tiles.get(`${x},${y}`);
  }

  getAllTiles(): PlacedTile[] {
    return Array.from(this.tiles.values());
  }

  getSerializedTiles(): Array<[string, PlacedTile]> {
    return Array.from(this.tiles.entries());
  }

  restoreFromSerializedTiles(entries: Array<[string, PlacedTile]>) {
    this.tiles = new Map(entries);
    this.recalculateBounds();
  }

  getAvailableSlots(): { x: number; y: number }[] {
    const slots: { x: number; y: number }[] = [];
    const checked = new Set<string>();

    this.tiles.forEach((tile) => {
      const neighbors = [
        { x: tile.x, y: tile.y - 1 },
        { x: tile.x + 1, y: tile.y },
        { x: tile.x, y: tile.y + 1 },
        { x: tile.x - 1, y: tile.y },
      ];

      neighbors.forEach((n) => {
        const key = `${n.x},${n.y}`;
        if (!this.tiles.has(key) && !checked.has(key)) {
          slots.push(n);
          checked.add(key);
        }
      });
    });

    return slots;
  }

  private updateBounds(x: number, y: number) {
    this.minX = Math.min(this.minX, x);
    this.maxX = Math.max(this.maxX, x);
    this.minY = Math.min(this.minY, y);
    this.maxY = Math.max(this.maxY, y);
  }

  getBounds() {
    return { minX: this.minX, maxX: this.maxX, minY: this.minY, maxY: this.maxY };
  }

  private recalculateBounds() {
    const allTiles = this.getAllTiles();
    if (allTiles.length === 0) {
      this.minX = 0;
      this.maxX = 0;
      this.minY = 0;
      this.maxY = 0;
      return;
    }
    this.minX = allTiles[0].x;
    this.maxX = allTiles[0].x;
    this.minY = allTiles[0].y;
    this.maxY = allTiles[0].y;
    allTiles.forEach(tile => {
      this.minX = Math.min(this.minX, tile.x);
      this.maxX = Math.max(this.maxX, tile.x);
      this.minY = Math.min(this.minY, tile.y);
      this.maxY = Math.max(this.maxY, tile.y);
    });
  }
}
