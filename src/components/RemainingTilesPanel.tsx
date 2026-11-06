import { useEffect, useRef } from 'react';
import { TILES, type TileData } from '../data/tiles';

interface RemainingTilesPanelProps {
  deck: readonly TileData[];
  totalTiles: number;
  onClose: () => void;
}

export default function RemainingTilesPanel({ deck, totalTiles, onClose }: RemainingTilesPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const counts = new Map<number, number>();
  for (const tile of deck) counts.set(tile.id, (counts.get(tile.id) ?? 0) + 1);

  useEffect(() => {
    const previousFocus = document.activeElement;
    closeButtonRef.current?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <section
      id="remaining-tiles-panel"
      className="hud-messages-panel hud-remaining-tiles-panel"
      role="dialog"
      aria-labelledby="remaining-tiles-title"
      onKeyDown={event => {
        // A focused close button must not trigger the board's Space/rotation shortcuts.
        if (!event.ctrlKey && !event.metaKey && [' ', 'r', 'R'].includes(event.key)) event.stopPropagation();
      }}
    >
      <div className="hmp-header">
        <span className="hmp-title" id="remaining-tiles-title">
          Remaining Tiles <span className="remaining-tiles-total">{deck.length}/{totalTiles}</span>
        </span>
        <button ref={closeButtonRef} className="hmp-close" type="button" aria-label="Close remaining tiles" onClick={onClose}>×</button>
      </div>
      <div className="remaining-tiles-grid" role="list" aria-label="Remaining counts for 25 tile types">
        {TILES.map(tile => {
          const count = counts.get(tile.id) ?? 0;
          return (
            <div
              key={tile.id}
              className={`remaining-tile${count === 0 ? ' is-empty' : ''}`}
              role="listitem"
              aria-label={`Tile ${tile.id}, ${count} remaining`}
            >
              <img src={tile.image} alt={`Tile ${tile.id}`} width={512} height={512} draggable={false} />
              <span className="remaining-tile-count" aria-hidden="true">{count}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
