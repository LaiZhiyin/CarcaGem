import React from 'react';
import type { TileData } from '../data/tiles';
import { TILE_REGIONS } from '../data/tiles';
import type { Player } from '../engine/player';

interface TileProps {
  data: TileData;
  rotation: number;
  x?: number;
  y?: number;
  meeple?: { playerId: number; regionId: string };
  tileSize?: number;
  players?: Player[];
  style?: React.CSSProperties;
  lastPlacedColor?: string;
}

const Tile: React.FC<TileProps> = ({ data, rotation, x, y, meeple, tileSize = 110, players, style, lastPlacedColor }) => {
  const getMeepleImg = (playerId: number): string => {
    if (players) {
      const player = players.find(p => p.id === playerId);
      if (player) return player.meepleImg;
    }
    const colors = ['red', 'yellow', 'green', 'blue'];
    return `/workers/take-point-${colors[(playerId - 1) % colors.length]}.png?v=1.0.4`;
  };

  const tileStyle: React.CSSProperties = {
    backgroundImage: `url(${data.image})`,
    backgroundSize: 'cover',
    transform: `rotate(${rotation}deg)`,
    left: x !== undefined ? x * tileSize : undefined,
    top: y !== undefined ? y * tileSize : undefined,
    width: tileSize,
    height: tileSize,
    boxShadow: lastPlacedColor ? `inset 0 0 0 4px ${lastPlacedColor}` : undefined,
    ...style
  };

  return (
    <div className="tile" style={tileStyle}>
      {/* Render explorers */}
      {meeple && (() => {
        const originalRegion = TILE_REGIONS[data.label]?.find(r => r.id === meeple.regionId);
        if (!originalRegion) return null;
        // Scale the explorer with the tile size.
        const meepleSize = Math.max(12, Math.round(tileSize * 0.25));
        return (
          <div
            className="meeple"
            style={{
              left: `${originalRegion.pos[0]}%`,
              top: `${originalRegion.pos[1]}%`,
              transform: `translate(-50%, -50%) rotate(-${rotation}deg)`,
              backgroundImage: `url(${getMeepleImg(meeple.playerId)})`,
              width: meepleSize,
              height: meepleSize,
            }}
          />
        );
      })()}
    </div>
  );
};

export default Tile;
