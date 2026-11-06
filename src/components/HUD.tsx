import React, { useState, useEffect, useRef } from 'react';
import type { Game } from '../engine/game';
import { getPlayerAvatarScale } from '../utils/playerAvatars';
import RemainingTilesPanel from './RemainingTilesPanel';

interface HUDProps {
  game: Game;
  onSkipMeeple: () => void;
  onUndo: () => void;
  onNewGame: () => void;
  onReload: () => void;
  showGameModal: (config: {
    message: string;
    onConfirm?: () => void;
    onCancel?: () => void;
    confirmLabel?: string;
    cancelLabel?: string;
    color?: string;
    icon?: string;
  }) => void;
  hideModal: () => void;
}

const HUD: React.FC<HUDProps> = ({ game, onSkipMeeple, onUndo, onNewGame, onReload, showGameModal }) => {
  const [isReviewing, setIsReviewing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [openPanel, setOpenPanel] = useState<'messages' | 'remaining' | null>(null);
  const showMessages = openPanel === 'messages';
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const lastReadCountRef = useRef(0);
  const currentPlayer = game.playerManager.getCurrentPlayer();
  const players = game.playerManager.getAllPlayers();
  const isGameOver = game.state === 'GAME_OVER';

  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (showMessages) {

      lastReadCountRef.current = game.scoreMessages.length;
      setUnreadMessageCount(0);
    } else {

      const newUnreadCount = Math.max(0, game.scoreMessages.length - lastReadCountRef.current);
      setUnreadMessageCount(newUnreadCount);
    }
  }, [showMessages, game.scoreMessages.length]);

  useEffect(() => {
    if (!showMessages && game.scoreMessages.length > lastReadCountRef.current) {
      setUnreadMessageCount(game.scoreMessages.length - lastReadCountRef.current);
    }
  }, [game.scoreMessages.length, showMessages]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      const requestFullscreen = document.documentElement.requestFullscreen;
      if (!requestFullscreen) return;
      requestFullscreen.call(document.documentElement).catch(err => {
        console.log(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen?.().catch(err => console.log(`Error exiting fullscreen: ${err.message}`));
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleReturn = () => {
    showGameModal({
      message: 'Returning home will end this game and discard its progress. Continue?',
      cancelLabel: 'Cancel',
      confirmLabel: 'Return Home',
      onConfirm: onNewGame,
      color: currentPlayer.color
    });
  };

  const getStatusText = (): string => {
    switch (game.state) {
      case 'PLACE_TILE': return currentPlayer.isAI ? `${currentPlayer.name} is thinking...` : `${currentPlayer.name}: Choose a tile position and orientation`;
      case 'ADJUST_TILE': return `${currentPlayer.name}: Choose a tile position and orientation`;
      case 'PLACE_MEEPLE': return `${currentPlayer.name}: Place an explorer or skip`;
      case 'AI_THINKING': return 'Thinking...';
      case 'GAME_OVER': return 'Game Over';
      default: return '';
    }
  };

  const totalTiles = 80;
  const remainingTiles = game.deck.length;

  return (
    <div className="hud-layer">

      <div className="hud-title">CarcaGem</div>

      <div className="next-tile-panel" style={{ borderColor: currentPlayer.color } as React.CSSProperties}>
        <div className="ntp-header">
           <span className="ntp-count-current" style={{ color: currentPlayer.color }}>
             {remainingTiles}
           </span>
           <span className="ntp-count-total">/{totalTiles}</span>
        </div>

        <div className="ntp-preview-box">
          {game.currentTile && (
            <div className="ntp-preview-img" style={{
              backgroundImage: `url(${game.currentTile.image})`
            }} />
          )}
        </div>

        <div className="ntp-status" style={{ color: currentPlayer.color }}>
          {getStatusText()}
        </div>
      </div>

      <div className="player-panel">
        {players.map(p => (
          <div
            key={p.id}
            className={`player-card ${p.id === currentPlayer.id ? 'active' : ''}`}
            style={{ borderColor: p.color } as React.CSSProperties}
          >
            <div className="pc-top">
              <div className="pc-avatar-frame" style={{ borderColor: p.color, background: `linear-gradient(135deg, ${p.color}22, ${p.color}44)` }}>
                <img
                  src={p.avatarImg || p.meepleImg}
                  className="pc-avatar"
                  alt={p.name}
                  style={{ width: `${getPlayerAvatarScale(p.avatarImg || p.meepleImg)}%`, height: `${getPlayerAvatarScale(p.avatarImg || p.meepleImg)}%` }}
                />
              </div>
              <div className="pc-info">
                <div className="pc-name">
                  {p.name}
                  {p.isAI && <span className="pc-ai-badge">AI</span>}
                </div>
              </div>
            </div>
            <div className="pc-stats">
              <div className="pc-score" style={{ color: p.color }}>{p.score}</div>
              <div className="pc-meeples">
                <img src={p.meepleImg} className="pc-meeple-icon" alt="meeple" />
                <span className="pc-meeple-num">{p.meeples}</span>
                <span className="pc-meeple-max">/8</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="hud-bottom-bar">
        <button className="hud-home-btn" title="Return to home" onClick={handleReturn}>
          <img src="/1-homepage.png?v=1.0.4" alt="Home" className="hud-home-icon" />
        </button>

        <button
          className="hud-message-btn"
          title="Latest Activity"
          onClick={() => setOpenPanel(showMessages ? null : 'messages')}
          style={{ position: 'relative' }}
        >
          <img src="/4-message.png?v=1.0.4" alt="Messages" className="hud-message-icon" />
          {unreadMessageCount > 0 && (
            <span className="hud-message-badge">{unreadMessageCount}</span>
          )}
        </button>

        <button
          className="hud-remaining-btn"
          type="button"
          title="Remaining Tiles"
          aria-label="Remaining Tiles"
          aria-expanded={openPanel === 'remaining'}
          aria-controls="remaining-tiles-panel"
          onClick={() => setOpenPanel(openPanel === 'remaining' ? null : 'remaining')}
        >
          <img src="/5-resttiles.png?v=1.0.4" alt="" className="hud-remaining-icon" />
        </button>

        {!game.isOnline && (
          <button className="hud-back-btn" title="Undo Last Turn" onClick={onUndo} disabled={game.history.length === 0}>
            <img src="/2-backout.png?v=1.0.4" alt="Undo" className="hud-back-icon" />
          </button>
        )}

        {!isMobile && (
          <button
            className="hud-fullscreen-btn"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            onClick={toggleFullscreen}
          >
            <img src="/3-fullscreen.png?v=1.0.4" alt="Fullscreen" className="hud-fullscreen-icon" />
          </button>
        )}
      </div>

      {showMessages && (
        <div className="hud-messages-panel">
          <div className="hmp-header">
            <span className="hmp-title">Latest Activity</span>
            <button className="hmp-close" onClick={() => setOpenPanel(null)}>×</button>
          </div>
          <div className="hmp-content">
            {game.scoreMessages.length === 0 ? (
              <div className="hmp-empty">No score updates yet</div>
            ) : (
              game.scoreMessages.slice().reverse().map((message, index) => {
                const player = players.find(p => message.startsWith(`${p.name} `));
                return (
                  <div key={index} className="hmp-message">
                    <span
                      className="hmp-message-dot"
                      style={{ backgroundColor: player?.color || '#e65f7e' }}
                    />
                    <span className="hmp-message-text">{message}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {openPanel === 'remaining' && (
        <RemainingTilesPanel deck={game.deck} totalTiles={totalTiles} onClose={() => setOpenPanel(null)} />
      )}

      {game.state === 'PLACE_MEEPLE' && !currentPlayer.isAI && (
        <div className="hud-bottom-status">
          <div className="bottom-status-content">
            <span>Choose a location for your explorer, or</span>
            <button className="btn-skip" onClick={onSkipMeeple}>
              {isMobile ? 'Skip' : 'Skip (Space)'}
            </button>
          </div>
        </div>
      )}

      {game.scoreAnimations.map(() => {
        return null;
      })}

      {isGameOver && !isReviewing && (
        <div className="game-over-overlay">
          <div className="game-over-card">
            <h1 className="go-title">Game Over</h1>
            <div className="go-winner">
              Winner:
              <strong style={{ color: players.slice().sort((a,b) => b.score - a.score)[0].color }}>
                {' '}{players.slice().sort((a,b) => b.score - a.score)[0].name}
              </strong>
            </div>
            <div className="go-scoreboard">
              {players.slice().sort((a,b) => b.score - a.score).map((p, i) => (
                <div key={p.id} className="go-score-row">
                  <span className="go-rank">{i + 1}.</span>
                  <div className="pc-avatar-frame go-avatar-frame" style={{ borderColor: p.color, background: `linear-gradient(135deg, ${p.color}22, ${p.color}44)` }}>
                    <img
                      src={p.avatarImg || p.meepleImg}
                      className="pc-avatar"
                      alt={p.name}
                      style={{ width: `${getPlayerAvatarScale(p.avatarImg || p.meepleImg)}%`, height: `${getPlayerAvatarScale(p.avatarImg || p.meepleImg)}%` }}
                    />
                  </div>
                  <span className="go-name">{p.name}</span>
                  <span className="go-score" style={{ color: p.color }}>{p.score} pts</span>
                </div>
              ))}
            </div>
            <div className="go-actions">
              <button className="btn-island" onClick={onNewGame}>Back to Lobby</button>
              <button className="btn-island secondary" onClick={onReload}>Play Again</button>
              <button className="btn-island outline" onClick={() => setIsReviewing(true)}>Review Game</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HUD;
