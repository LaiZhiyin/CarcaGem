import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { Game } from '../engine/game';
import Tile from './Tile';
import { isValidPlacement, getTentativeOccupiableRegionIds, getOccupiableRegionIds } from '../engine/validator';
import { getRotatedRegions } from '../data/tiles';
import { getTileSize } from '../utils/device';

interface GameBoardProps {
  game: Game;
  onPlaceMeeple: (regionId: string) => void;
  onSkipMeeple: () => void;
}

const getInitialTransform = () => ({
  x: typeof window === 'undefined' ? 0 : window.innerWidth / 2 - getTileSize() / 2,
  y: typeof window === 'undefined' ? 0 : window.innerHeight / 2 - getTileSize() / 2,
  scale: 1
});

interface BoardPointer {
  x: number;
  y: number;
  type: string;
  startX: number;
  startY: number;
}

const getPinchMetrics = (pointers: Map<number, BoardPointer>) => {
  const touches = [...pointers.values()].filter(pointer => pointer.type === 'touch');
  if (touches.length < 2) return null;
  const [first, second] = touches;
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    distance: Math.hypot(second.x - first.x, second.y - first.y),
  };
};

const getRegionTouchTargetSize = (
  boardScale: number,
  visibleDotSize: number,
) => {
  if (typeof window === 'undefined' || !window.matchMedia('(any-pointer: coarse)').matches) {
    return visibleDotSize;
  }
  // Keep touch controls 44 CSS pixels on screen even while the board is zoomed.
  return 44 / boardScale;
};

const GameBoard: React.FC<GameBoardProps> = ({ game, onPlaceMeeple, onSkipMeeple }) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState(getInitialTransform);
  const pointersRef = useRef(new Map<number, BoardPointer>());
  const dragPointerRef = useRef<number | null>(null);
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const dragMovedRef = useRef(false);
  const [, forceUpdate] = useState(0);
  const [tileSize, setTileSize] = useState(getTileSize);
  const lastViewportSize = useRef({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
    tileSize: getTileSize(),
  });

  useEffect(() => {
    const handleResize = () => {
      const nextSize = getTileSize();
      const previousViewport = lastViewportSize.current;
      lastViewportSize.current = { width: window.innerWidth, height: window.innerHeight, tileSize: nextSize };
      setTileSize(nextSize);
      setTransform(previous => ({
        ...previous,
        x: window.innerWidth / 2 - (previousViewport.width / 2 - previous.x) * nextSize / previousViewport.tileSize,
        y: window.innerHeight / 2 - (previousViewport.height / 2 - previous.y) * nextSize / previousViewport.tileSize,
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== 'touch' && e.button !== 0) return;
    const bounds = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - bounds.left;
    const y = e.clientY - bounds.top;
    const point = { x, y, type: e.pointerType, startX: x, startY: y };
    const pointers = pointersRef.current;
    if (pointers.size === 0) dragMovedRef.current = false;
    pointers.set(e.pointerId, point);

    // Capture on the original element so a normal tap still reaches its tile/button.
    const target = e.target as HTMLElement;
    target.setPointerCapture?.(e.pointerId);
    if (getPinchMetrics(pointers)) {
      dragMovedRef.current = true;
      dragPointerRef.current = null;
      dragOriginRef.current = null;
      e.preventDefault();
    } else if (!target.closest('.region-dot, .confirm-btn, .pending-tile, button')) {
      dragPointerRef.current = e.pointerId;
      dragOriginRef.current = point;
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const pointers = pointersRef.current;
    const previousPoint = pointers.get(e.pointerId);
    if (!previousPoint) return;
    const previousPinch = getPinchMetrics(pointers);
    const bounds = e.currentTarget.getBoundingClientRect();
    const point = { ...previousPoint, x: e.clientX - bounds.left, y: e.clientY - bounds.top };
    pointers.set(e.pointerId, point);
    // Moving off a captured control must cancel its tap, even when it cannot pan.
    if (Math.hypot(point.x - point.startX, point.y - point.startY) > 3) {
      dragMovedRef.current = true;
    }
    const pinch = getPinchMetrics(pointers);

    if (previousPinch && pinch) {
      dragMovedRef.current = true;
      e.preventDefault();
      const ratio = previousPinch.distance > 0 ? pinch.distance / previousPinch.distance : 1;
      setTransform(previous => {
        const scale = Math.max(0.3, Math.min(3, previous.scale * ratio));
        const zoom = scale / previous.scale;
        return {
          scale,
          x: pinch.x - (previousPinch.x - previous.x) * zoom,
          y: pinch.y - (previousPinch.y - previous.y) * zoom,
        };
      });
    } else if (dragPointerRef.current === e.pointerId) {
      const origin = dragOriginRef.current;
      if (origin && Math.hypot(point.x - origin.x, point.y - origin.y) > 3) {
        dragMovedRef.current = true;
      }
      setTransform(previous => ({
        ...previous,
        x: previous.x + point.x - previousPoint.x,
        y: previous.y + point.y - previousPoint.y,
      }));
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const pointers = pointersRef.current;
    if (!pointers.delete(e.pointerId)) return;
    if (e.type === 'pointercancel') dragMovedRef.current = true;
    const remaining = [...pointers.entries()];
    // Continue panning with the remaining finger, without permitting a release click.
    dragPointerRef.current = remaining.length === 1 ? remaining[0][0] : null;
    dragOriginRef.current = remaining.length === 1 ? remaining[0][1] : null;
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) {
        const bounds = el.getBoundingClientRect();
        const pointerX = e.clientX - bounds.left;
        const pointerY = e.clientY - bounds.top;
        setTransform(prev => {
          const scale = Math.max(0.3, Math.min(3, prev.scale * Math.exp(-0.01 * e.deltaY)));
          return { scale, x: pointerX - (pointerX - prev.x) * scale / prev.scale, y: pointerY - (pointerY - prev.y) * scale / prev.scale };
        });
      } else {
        setTransform(prev => ({
          ...prev,
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        }));
      }
    };

    el.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleNativeWheel);
  }, []);

  const handleSlotClick = (x: number, y: number) => {
    if (game.playerManager.getCurrentPlayer().isAI || dragMovedRef.current) return;
    if (game.state === 'ADJUST_TILE') {
      game.cancelPlace();
    }
    game.tentativePlace(x, y);
    forceUpdate(n => n + 1);
  };

  const handleRegionDotClick = (e: React.MouseEvent<HTMLButtonElement>, fallbackRegionId: string) => {
    e.stopPropagation();
    if (game.playerManager.getCurrentPlayer().isAI) return;
    if (e.detail === 0) {
      onPlaceMeeple(fallbackRegionId);
      return;
    }
    const candidates = Array.from(
      e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('.region-dot:not(:disabled)') ?? [],
    );
    const nearest = candidates.reduce<{ id: string; distance: number } | null>((best, button) => {
      const bounds = button.getBoundingClientRect();
      const distance = Math.hypot(e.clientX - (bounds.left + bounds.width / 2), e.clientY - (bounds.top + bounds.height / 2));
      const id = button.dataset.regionId;
      return id && (!best || distance < best.distance) ? { id, distance } : best;
    }, null);
    onPlaceMeeple(nearest?.id ?? fallbackRegionId);
  };

  const handlePendingTileClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (game.playerManager.getCurrentPlayer().isAI || dragMovedRef.current) return;
    game.rotateTile();
    forceUpdate(n => n + 1);
  };

  const renderPlaceholders = () => {
    if (game.playerManager.getCurrentPlayer().isAI) return null;
    if ((game.state !== 'PLACE_TILE' && game.state !== 'ADJUST_TILE') || !game.currentTile) return null;

    const slots = game.board.getAvailableSlots();
    return slots.map(slot => {
      if (game.state === 'ADJUST_TILE' && slot.x === game.pendingX && slot.y === game.pendingY) return null;

      let firstValidRot = -1;
      for (const rot of [0, 90, 180, 270]) {
        if (isValidPlacement(game.board, slot.x, slot.y, game.currentTile!, rot)) {
          firstValidRot = rot;
          break;
        }
      }
      if (firstValidRot === -1) return null;

      return (
        <div
          key={`ph-${slot.x},${slot.y}`}
          className="placeholder"
          style={{
            left: slot.x * tileSize,
            top: slot.y * tileSize,
            width: tileSize,
            height: tileSize,
          }}
          onClick={() => handleSlotClick(slot.x, slot.y)}
        >
          <div
            className="placeholder-preview"
            style={{
              backgroundImage: `url(${game.currentTile?.image})`,
              transform: `rotate(${firstValidRot}deg)`
            }}
          />
        </div>
      );
    });
  };

  const renderPendingTile = () => {
    if (game.state !== 'ADJUST_TILE' || !game.currentTile) return null;

    const isValid = game.isPendingValid();
    const currentPlayer = game.playerManager.getCurrentPlayer();
    const occupiableRegionIds = isValid
      ? getTentativeOccupiableRegionIds(game.board, game.pendingX, game.pendingY, game.currentTile, game.currentRotation)
      : new Set<string>();
    const occupiableRegions = getRotatedRegions(game.currentTile.label, game.currentRotation)
      .filter(region => occupiableRegionIds.has(region.id));
    const hasMeeples = currentPlayer.meeples > 0;

    return (
      <div style={{ position: 'absolute', left: game.pendingX * tileSize, top: game.pendingY * tileSize, width: tileSize, height: tileSize, zIndex: 20 }}>

        <div
          className={`tile pending-tile ${isValid ? 'pending-valid' : 'pending-invalid'}`}
          style={{
            width: '100%',
            height: '100%',
            backgroundImage: `url(${game.currentTile.image})`,
            transform: `rotate(${game.currentRotation}deg)`,
            cursor: 'pointer',
          }}
          onClick={handlePendingTileClick}
          title="Click to rotate tile"
        />

        {isValid && occupiableRegions.map(region => {
          let dotColor = '#999';
          if (hasMeeples) {
            switch (region.type) {
              case 'Sea': dotColor = '#2196f3'; break;
              case 'Road': dotColor = '#5d4037'; break;
              case 'Beach': dotColor = '#ffd700'; break;
              case 'Lighthouse': dotColor = '#ff3d00'; break;
            }
          }

          const dotSize = Math.max(8, Math.round(tileSize * 0.1));
          const touchTargetSize = getRegionTouchTargetSize(transform.scale, dotSize);

          return (
            <button
              key={region.id}
              className={`region-dot ${!hasMeeples ? 'disabled' : ''}`}
              type="button"
              aria-label={`Place an explorer in ${region.label}`}
              data-region-id={region.id}
              disabled={!hasMeeples}
              style={{
                position: 'absolute',
                left: `${region.pos[0]}%`,
                top: `${region.pos[1]}%`,
                transform: `translate(-50%, -50%)`,
                width: touchTargetSize,
                height: touchTargetSize,
              }}
              onClick={(e) => handleRegionDotClick(e, region.id)}
              title={hasMeeples ? region.label : 'No explorers remaining'}
            >
              <span className="region-dot-visual" style={{ width: dotSize, height: dotSize, backgroundColor: dotColor }} />
            </button>
          );
        })}
        {isValid && (
          <div
            className="confirm-btn non-rotating-confirm"
            style={{
              animation: 'tileAppear 0.2s ease-out',
              width: Math.round(tileSize * 0.25),
              height: Math.round(tileSize * 0.25),
              fontSize: Math.round(tileSize * 0.12),
              top: Math.round(tileSize * -0.25),
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (!game.playerManager.getCurrentPlayer().isAI) onSkipMeeple();
            }}
            title="Skip placing an explorer"
          >
            ✓
          </div>
        )}
      </div>
    );
  };

  const renderMeeplePlacement = () => {
    if (game.state !== 'PLACE_MEEPLE' || !game.lastPlacedTile) return null;

    const lt = game.lastPlacedTile;
    const currentPlayer = game.playerManager.getCurrentPlayer();
    const hasMeeples = currentPlayer.meeples > 0;

    const occupiableRegionIds = getOccupiableRegionIds(game.board, lt);
    const occupiableRegions = getRotatedRegions(lt.data.label, lt.rotation)
      .filter(region => occupiableRegionIds.has(region.id));

    return (
      <div style={{ position: 'absolute', left: lt.x * tileSize, top: lt.y * tileSize, width: tileSize, height: tileSize, zIndex: 20 }}>

        <div
          className="tile pending-tile pending-valid"
          style={{
            width: '100%',
            height: '100%',
            backgroundImage: `url(${lt.data.image})`,
            transform: `rotate(${lt.rotation}deg)`,
          }}
        />

        {occupiableRegions.map(region => {
          let dotColor = '#999';
          if (hasMeeples) {
            switch (region.type) {
              case 'Sea': dotColor = '#2196f3'; break;
              case 'Road': dotColor = '#5d4037'; break;
              case 'Beach': dotColor = '#ffd700'; break;
              case 'Lighthouse': dotColor = '#ff3d00'; break;
            }
          }

          const dotSize = Math.max(8, Math.round(tileSize * 0.1));
          const touchTargetSize = getRegionTouchTargetSize(transform.scale, dotSize);

          return (
            <button
              key={region.id}
              className={`region-dot ${!hasMeeples ? 'disabled' : ''}`}
              type="button"
              aria-label={`Place an explorer in ${region.label}`}
              data-region-id={region.id}
              disabled={!hasMeeples}
              style={{
                position: 'absolute',
                left: `${region.pos[0]}%`,
                top: `${region.pos[1]}%`,
                transform: `translate(-50%, -50%)`,
                width: touchTargetSize,
                height: touchTargetSize,
              }}
              onClick={(e) => handleRegionDotClick(e, region.id)}
              title={hasMeeples ? region.label : 'No explorers remaining'}
            >
              <span className="region-dot-visual" style={{ width: dotSize, height: dotSize, backgroundColor: dotColor }} />
            </button>
          );
        })}
        <div
          className="confirm-btn non-rotating-confirm"
          style={{
            animation: 'tileAppear 0.2s ease-out',
            width: Math.round(tileSize * 0.25),
            height: Math.round(tileSize * 0.25),
            fontSize: Math.round(tileSize * 0.12),
            top: Math.round(tileSize * -0.25),
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (!game.playerManager.getCurrentPlayer().isAI) onSkipMeeple();
          }}
          title="Skip placing an explorer"
        >
          ✓
        </div>
      </div>
    );
  };

  const bgSize = 20 * transform.scale;

  return (
    <div
      className="board-viewport"
      ref={viewportRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onLostPointerCapture={handlePointerUp}
      onClickCapture={e => {
        if (dragMovedRef.current && e.detail !== 0) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      style={{
        backgroundSize: `${bgSize}px ${bgSize}px`,
        backgroundPosition: `calc(${transform.x}px - ${bgSize - 1}px) calc(${transform.y}px - ${bgSize - 1}px)`,
      }}
    >
      <div
        className="board-content"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`
        }}
      >
        {game.board.getAllTiles().map(tile => {
          let lastColor: string | undefined;
          const currentPlayer = game.playerManager.getCurrentPlayer();
          game.playerManager.getAllPlayers().forEach(p => {
             if (p.id !== currentPlayer.id) {
                const pLast = game.lastPlacedTiles[p.id];
                if (pLast && pLast.x === tile.x && pLast.y === tile.y) {
                    lastColor = p.color;
                }
             }
          });
          return (
            <Tile
              key={`${tile.x},${tile.y}`}
              data={tile.data}
              rotation={tile.rotation}
              x={tile.x}
              y={tile.y}
              meeple={tile.meeple}
              tileSize={tileSize}
              players={game.playerManager.getAllPlayers()}
              lastPlacedColor={lastColor}
            />
          );
        })}

        {renderPendingTile()}
        {renderMeeplePlacement()}
        {renderPlaceholders()}

        {game.scoreAnimations.map(anim => {
          const p = game.playerManager.getPlayer(anim.playerId);
          return (
            <div
              key={anim.id}
              className="score-pop"
              style={{
                left: anim.x * tileSize + tileSize / 2,
                top: anim.y * tileSize + tileSize / 2,
                '--p-color': p?.color || '#ffd700'
              } as React.CSSProperties}
            >
              +{anim.points}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GameBoard;
