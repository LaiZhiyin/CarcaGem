import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import './index.css';
import { Game } from './engine/game';
import GameBoard from './components/GameBoard';
import HUD from './components/HUD';
import GameSetup from './components/GameSetup';
import HomePage from './components/HomePage';
import OnlineGameSetup from './components/OnlineGameSetup';
import GameModal from './components/GameModal';
import { performAiTurn } from './engine/ai';
import { AI_TURN_TIMING } from './engine/ai/pacing';
import { trackEvent, trackScreen } from './analytics/client';
import { VERSION } from './version';
import { leaveRoom, sessionState } from './network';
import { browserGameRuntime } from './gameRuntime.browser';

const ThreeDPrototype = lazy(() => import('./components/ThreeDPrototype'));

type AppScreen = 'home' | 'local_setup' | 'online_setup' | 'game';

interface ModalConfig {
  isOpen: boolean;
  message: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  color?: string;
  icon?: string;
  autoCloseTimer?: number;
}

function App() {
  const [screen, setScreen] = useState<AppScreen>('home');
  const [game, setGame] = useState<Game | null>(null);
  const [, setTick] = useState(0);

  const [modal, setModal] = useState<ModalConfig>({ isOpen: false, message: '' });

  const [refreshConfirm, setRefreshConfirm] = useState(false);
  const [navigationPromptType, setNavigationPromptType] = useState<'refresh' | 'navigate'>('refresh');
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  const allowUnloadRef = useRef(false);
  const analyticsGameIdRef = useRef('');
  useEffect(() => { trackScreen(screen, VERSION, screen === 'game' ? analyticsGameIdRef.current : ''); }, [screen]);

  const showGameModal = useCallback((config: Omit<ModalConfig, 'isOpen'>) => {
    setModal({
      isOpen: true,
      confirmLabel: config.confirmLabel || 'Confirm',
      ...config
    });
  }, []);

  const hideModal = useCallback(() => {
    setModal(prev => ({ ...prev, isOpen: false }));
  }, []);

  const requestNavigationConfirm = useCallback((type: 'refresh' | 'navigate', action: () => void) => {
    pendingNavigationRef.current = action;
    setNavigationPromptType(type);
    setRefreshConfirm(true);
  }, []);

  const handleNavigationConfirm = useCallback(() => {
    const action = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    setRefreshConfirm(false);
    if (!action) return;
    allowUnloadRef.current = true;
    if (analyticsGameIdRef.current.startsWith('local_')) trackEvent('game_exit_confirmed', { reason: 'navigation_confirmed' }, { gameId: analyticsGameIdRef.current });
    action();
  }, []);

  const handleRefreshCancel = useCallback(() => {
    pendingNavigationRef.current = null;
    setRefreshConfirm(false);
  }, []);

  const startGame = useCallback((playerConfigs: { name: string; color: string; isAI: boolean; meepleImg: string; avatarImg: string; id?: number }[], seed?: number, gameType: 'local' | 'online' = 'local') => {
    const newGame = new Game(playerConfigs as any, seed, browserGameRuntime);
    newGame.onStateChange = () => setTick(t => t + 1);
    newGame.onShowModal = (config) => showGameModal(config);
    newGame.start();
    const analyticsGameId = gameType === 'online' ? sessionState.gameId : 'local_' + crypto.randomUUID();
    analyticsGameIdRef.current = analyticsGameId;
    if (gameType === 'local') {
      trackEvent('game_started', { seats: playerConfigs.map(p => p.isAI) }, { gameId: analyticsGameId });
      newGame.onTelemetry = telemetry => trackEvent(telemetry.name, { ...telemetry }, { gameId: analyticsGameId });
    }
    trackEvent('game_viewed', { kind: gameType }, { gameId: analyticsGameId });
    setGame(newGame);
    setScreen('game');
  }, [showGameModal]);

  const startLocalGame = useCallback((playerConfigs: any, seed?: number) => {
    startGame(playerConfigs, seed, 'local');
  }, [startGame]);

  const startOnlineGame = useCallback((playerConfigs: any, seed?: number) => {
    startGame(playerConfigs, seed, 'online');
  }, [startGame]);

  const returnToSetup = useCallback(() => {
    if (analyticsGameIdRef.current.startsWith('local_')) trackEvent('game_exit_confirmed', { reason: 'return_home' }, { gameId: analyticsGameIdRef.current });
    analyticsGameIdRef.current = '';
    void leaveRoom();
    setGame(null);
    setScreen('home');
  }, []);

  useEffect(() => {
    if (!game) return;
    const currentPlayer = game.playerManager.getCurrentPlayer();
    if (!game.isOnline && currentPlayer.isAI && game.state === 'PLACE_TILE' && !modal.isOpen) {
      const controller = new AbortController();
      // Let the board render before posting to the worker.
      const timer = setTimeout(() => {
        void performAiTurn(game, controller.signal).catch(error => {
          if (!controller.signal.aborted) console.error('AI turn failed', error);
        });
      }, AI_TURN_TIMING.startDelayMs);
      return () => { clearTimeout(timer); controller.abort(); };
    }
  }, [game, game?.state, game?.tick, modal.isOpen]);

  useEffect(() => {
    if (!game || modal.isOpen || refreshConfirm) return;

    const handleKeyDown = (e: KeyboardEvent) => {

      if (e.key === 'F5' ||
          (e.metaKey || e.ctrlKey) && e.key === 'r' ||
          (e.metaKey || e.ctrlKey) && e.key === 'R') {
        e.preventDefault();
        requestNavigationConfirm('refresh', () => window.location.reload());
        return;
      }

      const currentPlayer = game.playerManager.getCurrentPlayer();
      if (currentPlayer.isAI) return;

      if (e.key.toLowerCase() === 'r') {
        game.rotateTile();
      }
      if (e.key === ' ') {
        e.preventDefault();
        game.skipMeeple();
      }
      if (e.key === 'Escape') {
        game.cancelPlace();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        game.undo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [game, modal.isOpen, refreshConfirm, requestNavigationConfirm]);

  useEffect(() => {
    if (screen !== 'game' || !game) return;
    const handleNavigationClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;

      const destination = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      if (destination.href === current.href) return;
      if (destination.origin === current.origin && destination.pathname === current.pathname && destination.search === current.search) return;

      event.preventDefault();
      requestNavigationConfirm('navigate', () => window.location.assign(destination.href));
    };

    document.addEventListener('click', handleNavigationClick, true);
    return () => document.removeEventListener('click', handleNavigationClick, true);
  }, [screen, game, requestNavigationConfirm]);

  const handlePlaceMeeple = useCallback((regionId: string) => {
    if (!game) return;
    game.placeMeeple(regionId);
  }, [game]);

  const handleSkipMeeple = useCallback(() => {
    if (!game) return;
    game.skipMeeple();
  }, [game]);

  const handleUndo = useCallback(() => {
    if (!game) return;
    game.undo();
  }, [game]);

  useEffect(() => {
    if (screen === 'game' && game) {

      const guardKey = '__carcagem_active_game_guard__';
      if (!(window.history.state && window.history.state[guardKey])) {
        window.history.pushState({ ...(window.history.state ?? {}), [guardKey]: true }, '', window.location.href);
      }

      const handlePopState = () => {
        const canReturnToPreviousPage = window.history.length > 2;
        window.history.pushState({ ...(window.history.state ?? {}), [guardKey]: true }, '', window.location.href);
        if (refreshConfirm) return;
        requestNavigationConfirm('navigate', () => {
          if (canReturnToPreviousPage) {
            allowUnloadRef.current = true;
            window.history.go(-2);
          } else {
            allowUnloadRef.current = true;
            window.location.assign('/');
          }
        });
      };

      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        if (allowUnloadRef.current) {
          allowUnloadRef.current = false;
          return;
        }

        e.preventDefault();
        e.returnValue = ' ';
        return ' ';
      };

      window.addEventListener('popstate', handlePopState);
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => {
        window.removeEventListener('popstate', handlePopState);
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }
  }, [screen, game, refreshConfirm, requestNavigationConfirm]);

  if (new URLSearchParams(window.location.search).get('prototype3d') === '1') {
    return <Suspense fallback={<div style={{ padding: 24 }}>Loading 3D prototype…</div>}><ThreeDPrototype /></Suspense>;
  }

  if (screen === 'home') {
    return (
      <HomePage
        onSelectLocal={() => { trackEvent('mode_selected', { kind: 'local' }); setScreen('local_setup'); }}
        onSelectOnline={() => { trackEvent('mode_selected', { kind: 'online' }); setScreen('online_setup'); }}
      />
    );
  }

  if (screen === 'local_setup' || (screen === 'game' && !game)) {
    return <GameSetup onStart={startLocalGame} onBack={() => setScreen('home')} />;
  }

  if (screen === 'online_setup') {
    return <OnlineGameSetup onStart={startOnlineGame} onBack={() => setScreen('home')} />;
  }

  return (
    <div className="game-container">
      <GameBoard
        game={game!}
        onPlaceMeeple={handlePlaceMeeple}
        onSkipMeeple={handleSkipMeeple}
      />
      <HUD
        game={game!}
        onSkipMeeple={handleSkipMeeple}
        onUndo={handleUndo}
        onNewGame={returnToSetup}
        onReload={() => requestNavigationConfirm('refresh', () => window.location.reload())}
        showGameModal={showGameModal}
        hideModal={hideModal}
      />
      <GameModal
        isOpen={modal.isOpen}
        message={modal.message}
        confirmLabel={modal.confirmLabel}
        cancelLabel={modal.cancelLabel}
        icon={modal.icon}
        onConfirm={() => {
          modal.onConfirm?.();
          hideModal();
        }}
        onCancel={() => {
          modal.onCancel?.();
          hideModal();
        }}
        playerColor={modal.color}
        autoCloseTimer={modal.autoCloseTimer}
      />

      <div className={`refresh-confirm-overlay ${refreshConfirm ? 'show' : ''}`}>
        <div className="refresh-confirm-content">
          <div className="refresh-confirm-icon">⚠️</div>
          <div className="refresh-confirm-body">
            {navigationPromptType === 'refresh' ? 'Are you sure you want to refresh?' : 'Are you sure you want to leave this page?'}<br/>
            <span style={{ fontSize: '14px', color: '#666' }}>Your current game progress will be lost.</span>
          </div>
          <div className="refresh-confirm-footer">
            <button className="rc-btn rc-btn-cancel" onClick={handleRefreshCancel}>
              Cancel
            </button>
            <button className="rc-btn rc-btn-confirm" onClick={handleNavigationConfirm}>
              {navigationPromptType === 'refresh' ? 'Refresh' : 'Leave Page'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
