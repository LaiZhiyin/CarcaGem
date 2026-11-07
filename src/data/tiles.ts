export type EdgeType = 'Sea' | 'Road' | 'Beach';
export type FeatureType = 'Lighthouse' | 'Road' | 'Beach' | 'Sea' | 'Intersection';

export interface TileRegion {
  id: string;              // 'beach-0', 'road-0', 'sea-0', 'lighthouse'
  type: FeatureType;
  edges: number[];
  fEdges?: number[];
  pos: [number, number];
  label: string;

  adjacentRegions?: {
    sea?: string[];
    beach?: string[];
    lighthouse?: boolean;
  };
}

export interface TileData {
  id: number;
  label: string;           // tiles_1, tiles_2...
  edges: [EdgeType, EdgeType, EdgeType, EdgeType]; // [Top, Right, Bottom, Left]
  center: FeatureType;
  centerIsNode?: boolean;
  treasure?: boolean;
  quantity: number;
  image: string;
}

export const TILES: TileData[] = [
  { id: 1, label: 'tiles_1', edges: ['Sea', 'Sea', 'Road', 'Sea'], center: 'Lighthouse', centerIsNode: true, quantity: 3, image: '/tiles/3d-concepts/tiles_1_3d_topdown.png?v=1.0.4' },
  { id: 2, label: 'tiles_2', edges: ['Sea', 'Sea', 'Sea', 'Sea'], center: 'Lighthouse', quantity: 4, image: '/tiles/3d-concepts/tiles_2_3d_topdown.png?v=1.0.4' },
  { id: 3, label: 'tiles_3', edges: ['Beach', 'Beach', 'Beach', 'Beach'], center: 'Beach', quantity: 2, image: '/tiles/3d-concepts/tiles_3_3d_topdown.png?v=1.0.4' },
  { id: 4, label: 'tiles_4', edges: ['Beach', 'Road', 'Sea', 'Road'], center: 'Road', quantity: 5, image: '/tiles/3d-concepts/tiles_4_3d_topdown.png?v=1.0.4' },
  { id: 5, label: 'tiles_5', edges: ['Sea', 'Sea', 'Beach', 'Sea'], center: 'Sea', quantity: 7, image: '/tiles/3d-concepts/tiles_5_3d_topdown.png?v=1.0.4' },
  { id: 6, label: 'tiles_6', edges: ['Beach', 'Sea', 'Beach', 'Sea'], center: 'Beach', quantity: 2, image: '/tiles/3d-concepts/tiles_6_3d_topdown.png?v=1.0.4' },
  { id: 7, label: 'tiles_7', edges: ['Sea', 'Sea', 'Road', 'Sea'], center: 'Road', centerIsNode: true, quantity: 1, image: '/tiles/3d-concepts/tiles_7_3d_topdown.png?v=1.0.4' },
  { id: 8, label: 'tiles_8', edges: ['Beach', 'Sea', 'Beach', 'Sea'], center: 'Sea', quantity: 3, image: '/tiles/3d-concepts/tiles_8_3d_topdown.png?v=1.0.4' },
  { id: 9, label: 'tiles_9', edges: ['Sea', 'Beach', 'Beach', 'Sea'], center: 'Sea', quantity: 3, image: '/tiles/3d-concepts/tiles_9_3d_topdown.png?v=1.0.4' },
  { id: 10, label: 'tiles_10', edges: ['Beach', 'Road', 'Road', 'Sea'], center: 'Road', quantity: 3, image: '/tiles/3d-concepts/tiles_10_3d_topdown.png?v=1.0.4' },
  { id: 11, label: 'tiles_11', edges: ['Beach', 'Sea', 'Road', 'Road'], center: 'Road', quantity: 3, image: '/tiles/3d-concepts/tiles_11_3d_topdown.png?v=1.0.4' },
  { id: 12, label: 'tiles_12', edges: ['Beach', 'Road', 'Road', 'Road'], center: 'Intersection', centerIsNode: true, quantity: 3, image: '/tiles/3d-concepts/tiles_12_3d_topdown.png?v=1.0.4' },
  { id: 13, label: 'tiles_13', edges: ['Beach', 'Road', 'Beach', 'Road'], center: 'Sea', quantity: 2, image: '/tiles/3d-concepts/tiles_13_3d_topdown.png?v=1.0.4' },
  { id: 14, label: 'tiles_14', edges: ['Sea', 'Beach', 'Beach', 'Sea'], center: 'Beach', quantity: 3, image: '/tiles/3d-concepts/tiles_14_3d_topdown.png?v=1.0.4' },
  { id: 15, label: 'tiles_15', edges: ['Beach', 'Road', 'Road', 'Beach'], center: 'Beach', quantity: 5, image: '/tiles/3d-concepts/tiles_15_3d_topdown.png?v=1.0.4' },
  { id: 16, label: 'tiles_16', edges: ['Beach', 'Beach', 'Sea', 'Beach'], center: 'Beach', quantity: 4, image: '/tiles/3d-concepts/tiles_16_3d_topdown.png?v=1.0.4' },
  { id: 17, label: 'tiles_17', edges: ['Beach', 'Beach', 'Road', 'Beach'], center: 'Beach', centerIsNode: true, quantity: 3, image: '/tiles/3d-concepts/tiles_17_3d_topdown.png?v=1.0.4' },
  { id: 18, label: 'tiles_18', edges: ['Sea', 'Road', 'Sea', 'Road'], center: 'Road', quantity: 5, image: '/tiles/3d-concepts/tiles_18_3d_topdown.png?v=1.0.4' },
  { id: 19, label: 'tiles_19', edges: ['Sea', 'Road', 'Road', 'Sea'], center: 'Road', quantity: 4, image: '/tiles/3d-concepts/tiles_19_3d_topdown.png?v=1.0.4' },
  { id: 20, label: 'tiles_20', edges: ['Road', 'Road', 'Road', 'Sea'], center: 'Intersection', centerIsNode: true, quantity: 4, image: '/tiles/3d-concepts/tiles_20_3d_topdown.png?v=1.0.4' },
  { id: 21, label: 'tiles_21', edges: ['Road', 'Road', 'Road', 'Road'], center: 'Intersection', centerIsNode: true, quantity: 3, image: '/tiles/3d-concepts/tiles_21_3d_topdown.png?v=1.0.4' },
  { id: 22, label: 'tiles_22', edges: ['Sea', 'Road', 'Road', 'Sea'], center: 'Road', treasure: true, quantity: 3, image: '/tiles/3d-concepts/tiles_22_3d_topdown.png?v=1.0.4' },
  { id: 23, label: 'tiles_23', edges: ['Sea', 'Road', 'Sea', 'Road'], center: 'Road', treasure: true, quantity: 2, image: '/tiles/3d-concepts/tiles_23_3d_topdown.png?v=1.0.4' },
  { id: 24, label: 'tiles_24', edges: ['Sea', 'Beach', 'Beach', 'Sea'], center: 'Beach', treasure: true, quantity: 2, image: '/tiles/3d-concepts/tiles_24_3d_topdown.png?v=1.0.4' },
  { id: 25, label: 'tiles_25', edges: ['Beach', 'Sea', 'Beach', 'Sea'], center: 'Beach', treasure: true, quantity: 1, image: '/tiles/3d-concepts/tiles_25_3d_topdown.png?v=1.0.4' },
];

export const TILE_REGIONS: Record<string, TileRegion[]> = {
  'tiles_1': [
    { id: 'sea-0', type: 'Sea', edges: [0, 1, 3], fEdges: [0, 1, 2, 3, 4, 5, 6, 7], pos: [83, 15], label: '🌊 Sea', adjacentRegions: { lighthouse: true } },
    { id: 'lighthouse', type: 'Lighthouse', edges: [], pos: [49, 45], label: '🔦 Lighthouse', adjacentRegions: { sea: ['sea-0'] } },
    { id: 'road-0', type: 'Road', edges: [2], pos: [50, 87], label: '🛤 Road' },
  ],
  'tiles_2': [
    { id: 'sea-0', type: 'Sea', edges: [0, 1, 2, 3], fEdges: [0, 1, 2, 3, 4, 5, 6, 7], pos: [84, 16], label: '🌊 Sea', adjacentRegions: { lighthouse: true } },
    { id: 'lighthouse', type: 'Lighthouse', edges: [], pos: [49, 46], label: '🔦 Lighthouse', adjacentRegions: { sea: ['sea-0'] } },
  ],
  'tiles_3': [
    { id: 'beach-0', type: 'Beach', edges: [0, 1, 2, 3], pos: [52, 26], label: '🏖 Beach' },
  ],
  'tiles_4': [
    { id: 'beach-0', type: 'Beach', edges: [0], pos: [38, 11], label: '🏖 Beach', adjacentRegions: { sea: ['sea-1'] } },
    { id: 'road-0', type: 'Road', edges: [1, 3], pos: [50, 50], label: '🛤 Road' },
    { id: 'sea-0', type: 'Sea', edges: [2], fEdges: [3, 4, 5, 6], pos: [37, 83], label: '🌊 Sea (south)', adjacentRegions: { sea: ['sea-1'] } },
    { id: 'sea-1', type: 'Sea', edges: [], fEdges: [7, 2], pos: [61, 35], label: '🌊 Sea (pocket)', adjacentRegions: { beach: ['beach-0'], sea: ['sea-0'] } },
  ],
  'tiles_5': [ // Beach 2. Sea others.
    { id: 'beach-0', type: 'Beach', edges: [2], pos: [50, 84], label: '🏖 Beach', adjacentRegions: { sea: ['sea-0'] } },
    { id: 'sea-0', type: 'Sea', edges: [0, 1, 3], fEdges: [0, 1, 2, 3, 6, 7], pos: [59, 26], label: '🌊 Sea', adjacentRegions: { beach: ['beach-0'] } },
  ],
  'tiles_6': [
    { id: 'beach-0', type: 'Beach', edges: [0, 2], pos: [44, 43], label: '🏖 Beach', adjacentRegions: { sea: ['sea-0', 'sea-1'] } },
    { id: 'sea-0', type: 'Sea', edges: [1], fEdges: [2, 3], pos: [90, 44], label: '🌊 Sea (east)', adjacentRegions: { beach: ['beach-0'] } },
    { id: 'sea-1', type: 'Sea', edges: [3], fEdges: [6, 7], pos: [11, 57], label: '🌊 Sea (west)', adjacentRegions: { beach: ['beach-0'] } },
  ],
  'tiles_7': [
    { id: 'sea-0', type: 'Sea', edges: [0, 1, 3], fEdges: [0, 1, 2, 3, 4, 5, 6, 7], pos: [49, 46], label: '🌊 Sea' },
    { id: 'road-0', type: 'Road', edges: [2], pos: [50, 88], label: '🛤 Road' },
  ],
  'tiles_8': [
    { id: 'beach-0', type: 'Beach', edges: [0], pos: [37, 10], label: '🏖 Beach (north)', adjacentRegions: { sea: ['sea-0'] } },
    { id: 'beach-1', type: 'Beach', edges: [2], pos: [53, 88], label: '🏖 Beach (south)', adjacentRegions: { sea: ['sea-0'] } },
    { id: 'sea-0', type: 'Sea', edges: [1, 3], fEdges: [2, 3, 6, 7], pos: [37, 50], label: '🌊 Sea', adjacentRegions: { beach: ['beach-0', 'beach-1'] } },
  ],
  'tiles_9': [
    { id: 'beach-0', type: 'Beach', edges: [1], pos: [89, 49], label: '🏖 Beach (east)', adjacentRegions: { sea: ['sea-0'] } },
    { id: 'beach-1', type: 'Beach', edges: [2], pos: [52, 86], label: '🏖 Beach (south)', adjacentRegions: { sea: ['sea-0'] } },
    { id: 'sea-0', type: 'Sea', edges: [0, 3], fEdges: [0, 1, 6, 7], pos: [41, 41], label: '🌊 Sea', adjacentRegions: { beach: ['beach-0', 'beach-1'] } },
  ],
  'tiles_10': [
    { id: 'beach-0', type: 'Beach', edges: [0], pos: [66, 10], label: '🏖 Beach', adjacentRegions: { sea: ['sea-0'] } },
    { id: 'road-0', type: 'Road', edges: [1, 2], pos: [62, 62], label: '🛤 Road' },
    { id: 'sea-0', type: 'Sea', edges: [3], fEdges: [2, 5, 6, 7], pos: [24, 53], label: '🌊 Sea (outer)', adjacentRegions: { beach: ['beach-0'], sea: ['sea-1'] } },
    { id: 'sea-1', type: 'Sea', edges: [], fEdges: [3, 4], pos: [84, 82], label: '🌊 Sea (inner corner)', adjacentRegions: { sea: ['sea-0'] } },
  ],
  'tiles_11': [
    { id: 'beach-0', type: 'Beach', edges: [0], pos: [49, 10], label: '🏖 Beach', adjacentRegions: { sea: ['sea-0'] } },
    { id: 'road-0', type: 'Road', edges: [2, 3], pos: [40, 64], label: '🛤 Road' },
    { id: 'sea-0', type: 'Sea', edges: [1], fEdges: [2, 3, 4, 7], pos: [58, 45], label: '🌊 Sea (outer)', adjacentRegions: { beach: ['beach-0'], sea: ['sea-1'] } },
    { id: 'sea-1', type: 'Sea', edges: [], fEdges: [5, 6], pos: [20, 80], label: '🌊 Sea (inner corner)', adjacentRegions: { sea: ['sea-0'] } },
  ],
  'tiles_12': [ // T-junction terminal (3 roads, 3 islands)
    { id: 'beach-0', type: 'Beach', edges: [0], pos: [38, 10], label: '🏖 Beach', adjacentRegions: { sea: ['sea-0'] } },
    { id: 'road-0', type: 'Road', edges: [1], pos: [80, 50], label: '🛤 Road (east)' },
    { id: 'road-1', type: 'Road', edges: [2], pos: [50, 85], label: 'Road endpoint (south)' },
    { id: 'road-2', type: 'Road', edges: [3], pos: [15, 50], label: '🛤 Road (west)' },
    { id: 'sea-0', type: 'Sea', edges: [], fEdges: [0, 1, 2, 7], pos: [78, 33], label: '🌊 Sea (north)', adjacentRegions: { beach: ['beach-0'] } },
    { id: 'sea-1', type: 'Sea', edges: [], fEdges: [5, 6], pos: [24, 79], label: '🌊 Sea (southwest)' },
    { id: 'sea-2', type: 'Sea', edges: [], fEdges: [3, 4], pos: [78, 78], label: '🌊 Sea (southeast)' },
  ],
  'tiles_13': [ // Beach 0, 2. Road 1, 3.
    { id: 'beach-0', type: 'Beach', edges: [0], pos: [50, 15], label: '🏖 Beach (north)', adjacentRegions: { sea: ['sea-0'] } },
    { id: 'beach-1', type: 'Beach', edges: [2], pos: [43, 85], label: '🏖 Beach (south)', adjacentRegions: { sea: ['sea-1'] } },
    { id: 'road-0', type: 'Road', edges: [1, 3], pos: [50, 50], label: '🛤 Road' },
    { id: 'sea-0', type: 'Sea', edges: [], fEdges: [2, 7], pos: [70, 35], label: '🌊 Sea (north)', adjacentRegions: { beach: ['beach-0'] } },
    { id: 'sea-1', type: 'Sea', edges: [], fEdges: [3, 6], pos: [31, 65], label: '🌊 Sea (south)', adjacentRegions: { beach: ['beach-1'] } },
  ],
  'tiles_14': [ // Beach 1, 2. Sea 0, 3.
    { id: 'beach-0', type: 'Beach', edges: [1, 2], pos: [71, 65], label: '🏖 Beach', adjacentRegions: { sea: ['sea-0'] } },
    { id: 'sea-0', type: 'Sea', edges: [0, 3], fEdges: [0, 1, 6, 7], pos: [29, 24], label: '🌊 Sea', adjacentRegions: { beach: ['beach-0'] } },
  ],
  'tiles_15': [ // Beach 0, 3. Road 1, 2.
    { id: 'beach-0', type: 'Beach', edges: [0, 3], pos: [36, 46], label: '🏖 Beach', adjacentRegions: { sea: ['sea-0'] } },
    { id: 'road-0', type: 'Road', edges: [1, 2], pos: [61, 64], label: '🛤 Road' },
    { id: 'sea-0', type: 'Sea', edges: [], fEdges: [2, 5], pos: [80, 30], label: '🌊 Sea (inner corner)', adjacentRegions: { beach: ['beach-0'] } },
    { id: 'sea-1', type: 'Sea', edges: [], fEdges: [3, 4], pos: [80, 80], label: '🌊 Sea (outer ring)', adjacentRegions: { sea: ['sea-0'] } },
  ],
  'tiles_16': [ // Beach 0, 1, 3. Sea 2.
    { id: 'beach-0', type: 'Beach', edges: [0, 1, 3], pos: [50, 26], label: '🏖 Beach', adjacentRegions: { sea: ['sea-0'] } },
    { id: 'sea-0', type: 'Sea', edges: [2], fEdges: [4, 5], pos: [43, 84], label: '🌊 Sea', adjacentRegions: { beach: ['beach-0'] } },
  ],
  'tiles_17': [
    { id: 'beach-0', type: 'Beach', edges: [0, 1, 3], pos: [51, 27], label: '🏖 Beach', adjacentRegions: { sea: ['sea-0', 'sea-1'] } },
    { id: 'road-0', type: 'Road', edges: [2], pos: [50, 88], label: '🛤 Road' },
    { id: 'sea-0', type: 'Sea', edges: [], fEdges: [5], pos: [24, 87], label: '🌊 Sea (southwest)', adjacentRegions: { beach: ['beach-0'] } },
    { id: 'sea-1', type: 'Sea', edges: [], fEdges: [4], pos: [72, 88], label: '🌊 Sea (southeast)', adjacentRegions: { beach: ['beach-0'] } },
  ],
  'tiles_18': [ // Road 1, 3. Sea 0, 2.
    { id: 'road-0', type: 'Road', edges: [1, 3], pos: [50, 50], label: '🛤 Road' },
    { id: 'sea-0', type: 'Sea', edges: [0], fEdges: [0, 1, 2, 7], pos: [50, 21], label: '🌊 Sea (north)' },
    { id: 'sea-1', type: 'Sea', edges: [2], fEdges: [3, 4, 5, 6], pos: [44, 79], label: '🌊 Sea (south)' },
  ],
  'tiles_19': [
    { id: 'road-0', type: 'Road', edges: [1, 2], pos: [62, 64], label: '🛤 Road' },
    { id: 'sea-0', type: 'Sea', edges: [0, 3], fEdges: [0, 1, 5, 6, 7, 2], pos: [41, 38], label: '🌊 Sea (outer)' },
    { id: 'sea-1', type: 'Sea', edges: [], fEdges: [3, 4], pos: [79, 84], label: '🌊 Sea (inner corner)' },
  ],
  'tiles_20': [ // T-junction terminal (Roads 0,1,2 separate)
    { id: 'road-0', type: 'Road', edges: [0], pos: [50, 15], label: '🛤 Road (north)' },
    { id: 'road-1', type: 'Road', edges: [1], pos: [85, 50], label: 'Road endpoint (east)' },
    { id: 'road-2', type: 'Road', edges: [2], pos: [50, 85], label: 'Road endpoint (south)' },
    { id: 'sea-0', type: 'Sea', edges: [3], fEdges: [5, 6, 7, 0], pos: [23, 53], label: '🌊 Sea (west)' },
    { id: 'sea-1', type: 'Sea', edges: [], fEdges: [1, 2], pos: [79, 22], label: '🌊 Sea (northeast)' },
    { id: 'sea-2', type: 'Sea', edges: [], fEdges: [3, 4], pos: [77, 80], label: '🌊 Sea (southeast)' },
  ],
  'tiles_21': [ // Crossroad terminal (Roads 0,1,2,3 separate)
    { id: 'road-0', type: 'Road', edges: [0], pos: [50, 15], label: 'Road endpoint (north)' },
    { id: 'road-1', type: 'Road', edges: [1], pos: [85, 50], label: 'Road endpoint (east)' },
    { id: 'road-2', type: 'Road', edges: [2], pos: [50, 85], label: 'Road endpoint (south)' },
    { id: 'road-3', type: 'Road', edges: [3], pos: [15, 50], label: 'Road endpoint (west)' },
    { id: 'sea-0', type: 'Sea', edges: [], fEdges: [0, 7], pos: [18, 13], label: '🌊 Sea (northwest)' },
    { id: 'sea-1', type: 'Sea', edges: [], fEdges: [1, 2], pos: [78, 19], label: '🌊 Sea (northeast)' },
    { id: 'sea-2', type: 'Sea', edges: [], fEdges: [5, 6], pos: [19, 81], label: '🌊 Sea (southwest)' },
    { id: 'sea-3', type: 'Sea', edges: [], fEdges: [3, 4], pos: [83, 80], label: '🌊 Sea (southeast)' },
  ],
  'tiles_22': [ // Road 1-2 split (Treasure)
    { id: 'road-0', type: 'Road', edges: [1, 2], pos: [63, 63], label: '🛤 Road' },
    { id: 'sea-0', type: 'Sea', edges: [0, 3], fEdges: [0, 1, 5, 6, 7, 2], pos: [41, 38], label: '🌊 Sea (outer)' },
    { id: 'sea-1', type: 'Sea', edges: [], fEdges: [3, 4], pos: [80, 83], label: '🌊 Sea (inner corner)' },
  ],
  'tiles_23': [ // Road 1, 3 split (Treasure)
    { id: 'road-0', type: 'Road', edges: [1, 3], pos: [50, 50], label: '🛤 Road' },
    { id: 'sea-0', type: 'Sea', edges: [0], fEdges: [0, 1, 2, 7], pos: [50, 21], label: '🌊 Sea (north)' },
    { id: 'sea-1', type: 'Sea', edges: [2], fEdges: [3, 4, 5, 6], pos: [43, 81], label: '🌊 Sea (south)' },
  ],
  'tiles_24': [ // Beach 1, 2 corner (Treasure)
    { id: 'beach-0', type: 'Beach', edges: [1, 2], pos: [71, 65], label: '🏖 Beach', adjacentRegions: { sea: ['sea-0'] } },
    { id: 'sea-0', type: 'Sea', edges: [0, 3], fEdges: [0, 1, 6, 7], pos: [28, 24], label: '🌊 Sea', adjacentRegions: { beach: ['beach-0'] } },
  ],
  'tiles_25': [ // Beach 0, 2 (Diagonal). (Treasure)
    { id: 'beach-0', type: 'Beach', edges: [0, 2], pos: [43, 45], label: '🏖 Beach', adjacentRegions: { sea: ['sea-0', 'sea-1'] } },
    { id: 'sea-0', type: 'Sea', edges: [1], fEdges: [2, 3], pos: [90, 41], label: '🌊 Sea (east)', adjacentRegions: { beach: ['beach-0'] } },
    { id: 'sea-1', type: 'Sea', edges: [3], fEdges: [6, 7], pos: [9, 61], label: '🌊 Sea (west)', adjacentRegions: { beach: ['beach-0'] } },
  ],
};

export function getRotatedRegions(label: string, rotation: number): TileRegion[] {
  const regions = TILE_REGIONS[label];
  if (!regions) return [];
  const steps = ((rotation % 360) + 360) % 360 / 90;
  return regions.map(r => {
    let edges = [...r.edges];
    let fEdges = r.fEdges ? [...r.fEdges] : undefined;
    let [px, py] = r.pos;
    for (let s = 0; s < steps; s++) {
      edges = edges.map(e => (e + 1) % 4);
      if (fEdges) fEdges = fEdges.map(fe => (fe + 2) % 8);
      const newPx = 100 - py;
      const newPy = px;
      px = newPx;
      py = newPy;
    }
    return { ...r, edges, fEdges, pos: [px, py] as [number, number] };
  });
}

export function generateDeck(): TileData[] {
  const deck: TileData[] = [];
  TILES.forEach(tile => {
    for (let i = 0; i < tile.quantity; i++) {

        if (tile.label === 'tiles_4' && i === 0) continue;
        deck.push({ ...tile });
    }
  });

  for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
