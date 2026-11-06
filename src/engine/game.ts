import { Board } from './board.js';
import type { PlacedTile } from './board.js';
import { PlayerManager, type Player } from './player.js';
import type { TileData } from '../data/tiles.js';
import { generateDeck, TILES, getRotatedRegions } from '../data/tiles.js';
import { isValidPlacement, canPlaceTileAnywhere, isFeatureOccupied, getTentativeOccupiableRegionIds, getOccupiableRegionIds } from './validator.js';
import { findFeature, checkLighthouse, calculateScore, getHalfEdges, F_EDGE_DIR, regionTouchesHalfEdge, SeaBeachTracker } from './scoring.js';
import type { Feature } from './scoring.js';
import { getIndependentRegionId } from './regionId.js';
import { seededShuffle } from './random.js';
import { silentGameRuntime, type GameRuntime, type OnlineAction } from './gameRuntime.js';
import type { GameTelemetry } from '../analytics/model.js';

export type GameState = 'START' | 'PLACE_TILE' | 'ADJUST_TILE' | 'PLACE_MEEPLE' | 'SCORING' | 'GAME_OVER' | 'AI_THINKING';

export interface ScoreAnimation {
  id: number;
  points: number;
  x: number;
  y: number;
  playerId: number;
}

export interface PublicGameSnapshot {
  tiles: Array<[string, PlacedTile]>;
  players: Player[];
  currentIndex: number;
  extraTurns: Record<number, number>;
  currentTile: TileData | null;
  tracker: object;
  closedBeaches: Map<string, ClosedBeachRecord>;
  seaIndex: Map<string, Set<string>>;
}

interface GameHistoryEntry {
  publicState: PublicGameSnapshot;
  boardTiles: string; // Serialized Map
  players: string;    // Serialized Array
  deck: string;       // Serialized Array
  currentIndex: number;
  state: GameState;
  currentTile: string | null;
  currentRotation: number;
  lastPlacedTile: string | null;
}

interface ClosedBeachRecord {
  beachKey: string;
  tileCoords: string[];
  adjacentSeaIds: string[];
  closedAtTurn: number;
}

export class Game {
  private runtime: GameRuntime;
  simulation = false;
  private finalized = false;
  board: Board;
  playerManager: PlayerManager;
  deck: TileData[];
  currentTile: TileData | null = null;
  currentRotation = 0;
  state: GameState = 'START';
  lastPlacedTile: PlacedTile | null = null;
  lastPlacedTiles: { [playerId: number]: PlacedTile } = {};
  tick = 0;

  private seaBeachTracker: SeaBeachTracker = new SeaBeachTracker();

  history: GameHistoryEntry[] = [];
  scoreAnimations: ScoreAnimation[] = [];
  scoreMessages: string[] = [];
  private animId = 0;

  pendingX = 0;
  pendingY = 0;

  onStateChange: () => void = () => {};
  onTelemetry: (event: GameTelemetry) => void = () => {};
  private telemetrySequence = 0;
  private telemetryTurns: { id: string; x: number; y: number }[] = [];
  private emitTelemetry(event: GameTelemetry) {
    if (!this.simulation) { try { this.onTelemetry({ ...event, remaining: this.deck.length }); } catch (error) { console.error('Telemetry unavailable', error); } }
  }
  onShowModal: (config: { message: string; color?: string; icon?: string; autoCloseTimer?: number }) => void = () => {};

  isOnline = false;
  seed = 0;

  private closedBeaches: Map<string, ClosedBeachRecord> = new Map();

  private seaToBeachesIndex: Map<string, Set<string>> = new Map();

  constructor(playerConfigs: { name: string; color: string; isAI: boolean; meepleImg: string; avatarImg: string; userId?: string }[], seed?: number, runtime: GameRuntime = silentGameRuntime, simulation = false) {
    this.runtime = runtime;
    this.simulation = simulation;
    this.board = new Board();
    this.playerManager = new PlayerManager(playerConfigs);

    if (simulation) {
      this.deck = [];
    } else if (seed !== undefined) {
      this.isOnline = true;
      this.seed = seed;

      this.deck = this.generateSeededDeck(seed);
    } else {
      this.deck = generateDeck();
    }

    const startTile = TILES.find(t => t.label === 'tiles_4')!;
    const placedStartTile = this.board.placeTile(0, 0, startTile, 0);

    this.seaBeachTracker.updateOnTilePlaced(placedStartTile, this.board);

    if (this.isOnline) {
      this.initNetworkListeners();
    }
  }

  private generateSeededDeck(seed: number): TileData[] {
    const rawDeck: TileData[] = [];
    TILES.forEach(tile => {
      for (let i = 0; i < tile.quantity; i++) {
        if (tile.label === 'tiles_4' && i === 0) continue;
        rawDeck.push({ ...tile });
      }
    });
    return seededShuffle(rawDeck, seed);
  }

  private initNetworkListeners() {
    this.runtime.onAction((payload) => this.handleRemoteAction(payload));
  }

  private handleRemoteAction(payload: OnlineAction) {
    const { action, by } = payload;
    if (by === this.runtime.localUserId()) return;
    if (by !== this.playerManager.getCurrentPlayer().userId) return;

    switch (action) {
      case 'ROTATE':
        this.rotateTile(true);
        break;
      case 'TENTATIVE_PLACE':
        this.tentativePlace(payload.data.x, payload.data.y, true);
        break;
      case 'CONFIRM_PLACE':
        this.confirmPlace(true);
        break;
      case 'CANCEL_PLACE':
        this.cancelPlace(true);
        break;
      case 'PLACE_MEEPLE':
        this.placeMeeple(payload.data.regionId, true);
        break;
      case 'SKIP_MEEPLE':
        this.skipMeeple(true);
        break;
    }
  }

  start() {
    this.drawTile();
  }

  isMyTurn(): boolean {
    if (!this.isOnline) return true;
    return this.playerManager.getCurrentPlayer().userId === this.runtime.localUserId();
  }

  seaEvaluationGroups() { return this.seaBeachTracker.seaEvaluationGroups(); }

  projectedSeaScores() { return this.seaBeachTracker.calculateFinalSeaScores(); }

  publicSnapshot(): PublicGameSnapshot {
    return structuredClone({ tiles: this.board.getSerializedTiles(), players: this.playerManager.players,
      currentIndex: this.playerManager.currentIndex, extraTurns: this.playerManager.extraTurns,
      currentTile: this.currentTile, tracker: this.seaBeachTracker,
      closedBeaches: this.closedBeaches, seaIndex: this.seaToBeachesIndex });
  }

  static fromPublicSnapshot(snapshot: PublicGameSnapshot, future: TileData[] = []): Game {
    const game = new Game(snapshot.players, undefined, silentGameRuntime, true);
    game.simulation = true;
    game.restorePublic(snapshot);
    game.deck = future.map(t => ({ ...t }));
    game.state = snapshot.currentTile ? 'PLACE_TILE' : 'START';
    return game;
  }

  private restorePublic(snapshot: PublicGameSnapshot) {
    const s = structuredClone(snapshot);
    this.board.restoreFromSerializedTiles(s.tiles);
    this.playerManager.players = s.players;
    this.playerManager.currentIndex = s.currentIndex;
    this.playerManager.extraTurns = s.extraTurns;
    this.currentTile = s.currentTile;
    this.seaBeachTracker = Object.assign(new SeaBeachTracker(), s.tracker);
    this.closedBeaches = s.closedBeaches;
    this.seaToBeachesIndex = s.seaIndex;
    this.finalized = false;
  }

  saveHistory() {
    if (this.simulation) return;
    const entry: GameHistoryEntry = {
      publicState: this.publicSnapshot(),
      boardTiles: JSON.stringify(this.board.getSerializedTiles()),
      players: JSON.stringify(this.playerManager.players),
      deck: JSON.stringify(this.deck),
      currentIndex: this.playerManager.currentIndex,
      state: this.state,
      currentTile: this.currentTile ? JSON.stringify(this.currentTile) : null,
      currentRotation: this.currentRotation,
      lastPlacedTile: this.lastPlacedTile ? JSON.stringify(this.lastPlacedTile) : null,
    };
    this.history.push(entry);
    if (this.history.length > 50) this.history.shift(); // Keep last 50 moves
  }

  undo(allowOnlineCancel = false) {
    if (this.isOnline && !allowOnlineCancel) return;
    if (this.history.length === 0) {
      this.runtime.playSound('playError');
      return;
    }

    const wasFinished = this.state === 'GAME_OVER';
    const prev = this.history.pop()!;

    // Restore Board
    const tileEntries = JSON.parse(prev.boardTiles) as Array<[string, PlacedTile]>;
    this.board.restoreFromSerializedTiles(tileEntries);

    this.restorePublic(prev.publicState);

    // Restore PlayerManager
    this.playerManager.players = JSON.parse(prev.players);
    this.playerManager.currentIndex = prev.currentIndex;

    // Restore Deck
    this.deck = JSON.parse(prev.deck);

    // Restore State
    this.state = prev.state;
    this.currentTile = prev.currentTile ? JSON.parse(prev.currentTile) : null;
    this.currentRotation = prev.currentRotation;
    this.lastPlacedTile = prev.lastPlacedTile ? JSON.parse(prev.lastPlacedTile) : null;
    this.telemetryTurns = this.telemetryTurns.filter(turn => {
      if (this.board.getTile(turn.x, turn.y)) return true;
      this.emitTelemetry({ name: 'turn_retracted', turnId: turn.id }); return false;
    });
    if (wasFinished) this.emitTelemetry({ name: 'game_reopened' });

    this.tick++;
    this.runtime.playSound('playClick');
    this.onStateChange();
  }

  drawTile() {
    this.tick++;
    if (this.deck.length === 0) {
      const wasFinished = this.state === 'GAME_OVER';
      if (this.state !== 'GAME_OVER') {
        this.processFinalScoring();
      }
      this.state = 'GAME_OVER';
      if (!wasFinished) this.emitTelemetry({ name: 'game_finished', reason: 'deck_exhausted' });
      this.onStateChange();
      return;
    }

    this.currentTile = this.deck.pop()!;
    this.currentRotation = 0;

    if (!canPlaceTileAnywhere(this.board, this.currentTile)) {
      this.deck.unshift(this.currentTile);
      this.currentTile = null;
      if (this.deck.every(t => !canPlaceTileAnywhere(this.board, t))) {
        this.processFinalScoring();
        this.state = 'GAME_OVER';
        this.emitTelemetry({ name: 'game_finished', reason: 'no_legal_placement' });
        this.onStateChange();
        return;
      }
      this.drawTile();
      return;
    }

    this.state = 'PLACE_TILE';
    this.onStateChange();
  }

  rotateTile(isRemote = false) {
    if (this.isOnline && !isRemote && !this.isMyTurn()) return;

    if (this.state === 'PLACE_TILE') {
      this.currentRotation = (this.currentRotation + 90) % 360;
      this.runtime.playSound('playRotate');
    } else if (this.state === 'ADJUST_TILE') {
      let attempts = 0;
      do {
        this.currentRotation = (this.currentRotation + 90) % 360;
        attempts++;
      } while (!this.isPendingValid() && attempts < 4);
      this.runtime.playSound('playRotate');
    } else {
      this.runtime.playSound('playError');
      return;
    }

    if (this.isOnline && !isRemote) {
      this.runtime.sendAction({ by: this.runtime.localUserId(), action: 'ROTATE' });
    }
    this.onStateChange();
  }

  tentativePlace(x: number, y: number, isRemote = false): boolean {
    if (this.isOnline && !isRemote && !this.isMyTurn()) return false;

    if ((this.state !== 'PLACE_TILE' && this.state !== 'ADJUST_TILE') || !this.currentTile) {
      if (!isRemote) this.runtime.playSound('playError');
      return false;
    }
    if (this.board.getTile(x, y)) {
      if (!isRemote) this.runtime.playSound('playError');
      return false;
    }

    const slots = this.board.getAvailableSlots();
    const isSlot = slots.some(s => s.x === x && s.y === y);
    if (!isSlot) {
      if (!isRemote) this.runtime.playSound('playError');
      return false;
    }

    // Save history before placing
    this.saveHistory();

    this.pendingX = x;
    this.pendingY = y;
    this.state = 'ADJUST_TILE';

    if (!this.isPendingValid()) {
      for (let i = 0; i < 3; i++) {
        this.currentRotation = (this.currentRotation + 90) % 360;
        if (this.isPendingValid()) break;
      }
    }

    if (!isRemote) this.runtime.playSound('playPlaceTile');

    if (this.isOnline && !isRemote) {
      this.runtime.sendAction({ by: this.runtime.localUserId(), action: 'TENTATIVE_PLACE', data: { x, y } });
    }

    this.onStateChange();
    return true;
  }

  tryPlaceTile(x: number, y: number): boolean {
    if (!this.tentativePlace(x, y)) return false;
    return this.confirmPlace();
  }

  isPendingValid(): boolean {
    if (this.state !== 'ADJUST_TILE' || !this.currentTile) return false;
    return isValidPlacement(this.board, this.pendingX, this.pendingY, this.currentTile, this.currentRotation);
  }

  confirmPlace(isRemote = false): boolean {
    if (this.isOnline && !isRemote && !this.isMyTurn()) return false;

    if (!this.isPendingValid() || !this.currentTile) return false;

    const currentId = this.playerManager.getCurrentPlayer().id;
    const pt = this.board.placeTile(this.pendingX, this.pendingY, this.currentTile, this.currentRotation, currentId);
    this.lastPlacedTile = pt;
    this.lastPlacedTiles[currentId] = pt;

    this.seaBeachTracker.updateOnTilePlaced(pt, this.board);

    this.currentTile = null;
    this.state = 'PLACE_MEEPLE';

    if (this.isOnline && !isRemote) {
      this.runtime.sendAction({ by: this.runtime.localUserId(), action: 'CONFIRM_PLACE' });
    }

    this.onStateChange();
    return true;
  }

  cancelPlace(isRemote = false): void {
    if (this.isOnline && !isRemote && !this.isMyTurn()) return;

    if (this.state === 'ADJUST_TILE') {
      // Revert to history
      this.undo(true);
      if (!isRemote) this.runtime.playSound('playClick');

      if (this.isOnline && !isRemote) {
        this.runtime.sendAction({ by: this.runtime.localUserId(), action: 'CANCEL_PLACE' });
      }
    }
  }

  skipMeeple(isRemote = false): boolean {
    if (this.isOnline && !isRemote && !this.isMyTurn()) return false;

    if (this.state === 'ADJUST_TILE') {
      if (this.confirmPlace(isRemote)) {
        if (!isRemote) this.runtime.playSound('playClick');
        this.completeTurn();
      } else {
        if (!isRemote) this.runtime.playSound('playError');
        return false;
      }
    } else if (this.state === 'PLACE_MEEPLE') {
      if (!isRemote) this.runtime.playSound('playClick');
      this.completeTurn();
    } else {
      if (!isRemote) this.runtime.playSound('playError');
      return false;
    }

    if (this.isOnline && !isRemote) {
      this.runtime.sendAction({ by: this.runtime.localUserId(), action: 'SKIP_MEEPLE' });
    }
    return true;
  }

  placeMeeple(regionId: string, isRemote = false): boolean {
    if (this.isOnline && !isRemote && !this.isMyTurn()) return false;

    if (this.state === 'ADJUST_TILE') {
      if (!this.confirmPlace(isRemote)) {
        if (!isRemote) this.runtime.playSound('playError');
        return false;
      }
    }

    if (this.state !== 'PLACE_MEEPLE' || !this.lastPlacedTile) {
      if (!isRemote) this.runtime.playSound('playError');
      return false;
    }

    if (isFeatureOccupied(this.board, this.lastPlacedTile, regionId)) {
      if (!isRemote) this.runtime.playSound('playError');
      return false;
    }

    const player = this.playerManager.getCurrentPlayer();
    if (player.meeples <= 0) {
      if (!isRemote) this.runtime.playSound('playError');
      return false;
    }
    this.lastPlacedTile.meeple = {
      playerId: player.id,
      regionId: regionId
    };
    this.playerManager.useMeeple(player.id);

    this.seaBeachTracker.updateOwnerInfo(this.lastPlacedTile);

    if (!isRemote) this.runtime.playSound('playPlaceMeeple');

    if (this.isOnline && !isRemote) {
      this.runtime.sendAction({ by: this.runtime.localUserId(), action: 'PLACE_MEEPLE', data: { regionId } });
    }

    this.completeTurn();
    return true;
  }

  completeTurn() {
    const player = this.playerManager.getCurrentPlayer();
    this.state = 'SCORING';
    this.processScoring();
    if (!this.simulation && this.lastPlacedTile) {
      const id = 'turn_' + ++this.telemetrySequence;
      this.telemetryTurns.push({ id, x: this.lastPlacedTile.x, y: this.lastPlacedTile.y });
      this.emitTelemetry({ name: 'turn_committed', turnId: id, seat: player.id, isAI: player.isAI });
    }

    this.playerManager.nextTurn();
    this.drawTile();
  }

  getAvailableMeepleRegions(): string[] {
    const player = this.playerManager.getCurrentPlayer();
    if (player.meeples <= 0) return [];

    if (this.state === 'ADJUST_TILE' && this.currentTile) {
      const set = getTentativeOccupiableRegionIds(this.board, this.pendingX, this.pendingY, this.currentTile, this.currentRotation);
      return Array.from(set);
    }

    if (this.state === 'PLACE_MEEPLE' && this.lastPlacedTile) {
      const set = getOccupiableRegionIds(this.board, this.lastPlacedTile);
      return Array.from(set);
    }

    if (!this.lastPlacedTile) return [];
    const regions = getRotatedRegions(this.lastPlacedTile.data.label, this.lastPlacedTile.rotation);
    return regions
      .filter(r => !isFeatureOccupied(this.board, this.lastPlacedTile!, r.id))
      .map(r => r.id);
  }

  processScoring() {
    if (!this.lastPlacedTile) return;

    const lr = this.lastPlacedTile;
    const regions = getRotatedRegions(lr.data.label, lr.rotation);
    const processedFeatures = new Set<string>();
    const featuresToScore: { feature: Feature, points: number }[] = [];

    regions.forEach(r => {
      if (r.type === 'Lighthouse') {
        const res = checkLighthouse(this.board, lr);
        if (res.isCompleted) {
          if (lr.meeple && lr.meeple.regionId === r.id) {
            this.addScoreAnimation(res.score, lr.x, lr.y, lr.meeple.playerId);
            this.awardPoints('Lighthouse', res.score, lr.meeple);
            this.playerManager.returnMeeple(lr.meeple.playerId);
            lr.meeple = undefined;
          }
        }
      } else if (r.type === 'Road' || r.type === 'Beach') {
        const feature = findFeature(this.board, lr, r.id);
        const featureKey = feature.regions.map(fr => `${fr.tile.x},${fr.tile.y},${fr.region.id}`).sort().join('|');

        if (feature.isCompleted && !processedFeatures.has(featureKey)) {
          processedFeatures.add(featureKey);
          const points = calculateScore(feature);
          featuresToScore.push({ feature, points });

          if (feature.type === 'Beach') {

            for (const fr of feature.regions) {
              this.seaBeachTracker.markBeachClusterCompleted(fr.independentRegionId);
            }

            const beachKey = feature.regions
              .map(fr => `${fr.tile.x},${fr.tile.y}`)
              .sort()
              .join('|');

            if (!this.closedBeaches.has(beachKey)) {

              const adjacentSeaIds = this.findAdjacentSeas(feature);

              const record: ClosedBeachRecord = {
                beachKey,
                tileCoords: feature.regions.map(fr => `${fr.tile.x},${fr.tile.y}`),
                adjacentSeaIds,
                closedAtTurn: this.history.length
              };
              this.closedBeaches.set(beachKey, record);

              for (const seaId of adjacentSeaIds) {
                if (!this.seaToBeachesIndex.has(seaId)) {
                  this.seaToBeachesIndex.set(seaId, new Set());
                }
                this.seaToBeachesIndex.get(seaId)!.add(beachKey);
              }

            }
          }

          const hasTreasure = feature.regions.some(fr => fr.tile.data.label.match(/^tiles_(22|23|24|25)$/));
          if (hasTreasure && feature.meeples.length > 0) {
            const maxMeeples = Math.max(...feature.meeples.map(m => m.count));
            const winners = feature.meeples.filter(m => m.count === maxMeeples);
            winners.forEach(w => {
              this.playerManager.addExtraTurn(w.playerId);
              const p = this.playerManager.getPlayer(w.playerId);
              if (p) {

              const treasureMessage = `${p.name} completed a treasure area and earned an extra turn.`;
                this.scoreMessages.push(treasureMessage);
                if (this.scoreMessages.length > 50) {
                  this.scoreMessages.shift();
                }

                this.onShowModal({
                  message: `Congratulations, ${p.name}! A treasure tile completed an occupied feature. Take an extra turn.`,
                  color: p.color,
                  icon: '/bonus_icon.png',
                  autoCloseTimer: 1500
                });
              }
            });
          }

          this.releaseFeatureMeeples(feature);
        }
      }
    });

    // Scores are logical state: settle before advancing the turn. Animation stays cosmetic.
    featuresToScore.forEach(item => this.awardFeaturePoints(item.feature, item.points, lr.x, lr.y));

    this.board.getAllTiles().forEach(tile => {
      const tRegions = getRotatedRegions(tile.data.label, tile.rotation);
      const lh = tRegions.find(r => r.type === 'Lighthouse');
      if (lh && tile.meeple && tile.meeple.regionId === lh.id) {
        const res = checkLighthouse(this.board, tile);
        if (res.isCompleted) {
          this.addScoreAnimation(9, tile.x, tile.y, tile.meeple.playerId);
          this.awardPoints('Lighthouse', 9, tile.meeple);
          this.playerManager.returnMeeple(tile.meeple.playerId);
          tile.meeple = undefined;
        }
      }
    });
  }

  addScoreAnimation(points: number, x: number, y: number, playerId: number) {
    if (this.simulation) return;
    const anim: ScoreAnimation = {
      id: ++this.animId,
      points,
      x,
      y,
      playerId
    };
    this.scoreAnimations.push(anim);

    setTimeout(() => {
      this.scoreAnimations = this.scoreAnimations.filter(a => a.id !== anim.id);
      this.onStateChange();
    }, 2000);
    this.onStateChange();
  }

  releaseFeatureMeeples(feature: Feature) {
    feature.regions.forEach(fr => {
      if (fr.tile.meeple && fr.tile.meeple.regionId === fr.region.id) {
        this.playerManager.returnMeeple(fr.tile.meeple.playerId);
        fr.tile.meeple = undefined;
      }
    });
  }

  awardFeaturePoints(feature: Feature, points: number, animX: number, animY: number) {
    if (feature.meeples.length === 0) return;
    const maxMeeples = Math.max(...feature.meeples.map(m => m.count));
    const winners = feature.meeples.filter(m => m.count === maxMeeples);
    let awardedCount = 0;
    winners.forEach(w => {
      this.playerManager.addScore(w.playerId, points);

      if (points > 0) {
        const player = this.playerManager.getPlayer(w.playerId);
        if (player) {
          let featureType = '';
          switch (feature.type) {
            case 'Road': featureType = 'road'; break;
            case 'Beach': featureType = 'beach'; break;
            case 'Lighthouse': featureType = 'lighthouse'; break;
            default: featureType = feature.type;
          }
          const isCompleted = feature.isCompleted;
          const completionText = isCompleted ? 'completed' : 'unfinished';
          const message = `${player.name} ${completionText} ${featureType} for +${points} pts`;

          this.scoreMessages.push(message);
          if (this.scoreMessages.length > 50) {
            this.scoreMessages.shift();
          }
        }
      }
      this.addScoreAnimation(points, animX, animY, w.playerId);
      awardedCount++;
    });
    if (awardedCount > 0) {
      this.runtime.playSound('playScore');
    }
  }

  addFinalScoreMessages() {
    const players = this.playerManager.getAllPlayers();

    const processedFeatures = new Set<string>();
    const playerScores: Record<number, { road: number; beach: number; lighthouse: number }> = {};

    players.forEach(p => {
      playerScores[p.id] = { road: 0, beach: 0, lighthouse: 0 };
    });

    this.board.getAllTiles().forEach(tile => {
      const regions = getRotatedRegions(tile.data.label, tile.rotation);
      regions.forEach(r => {

        if (r.type !== 'Road' && r.type !== 'Beach' && r.type !== 'Lighthouse') {
          return;
        }

        let feature: Feature | null = null;
        let featureKey = '';

        if (r.type === 'Lighthouse' && tile.meeple && tile.meeple.regionId === r.id) {

          if (tile.meeple) {
            const playerId = tile.meeple.playerId;
            if (playerScores[playerId]) {
              const res = checkLighthouse(this.board, tile);
              playerScores[playerId].lighthouse += res.score;
            }
          }
          return;
        } else {
          feature = findFeature(this.board, tile, r.id);
          featureKey = feature.regions.map(fr => `${fr.tile.x},${fr.tile.y},${fr.region.id}`).sort().join('|');
        }

        if (feature && !processedFeatures.has(featureKey)) {
          processedFeatures.add(featureKey);

          const points = calculateScore(feature, true);

          if (feature.meeples.length > 0) {
            const maxMeeples = Math.max(...feature.meeples.map(m => m.count));
            const winners = feature.meeples.filter(m => m.count === maxMeeples);

            winners.forEach(w => {
              const playerId = w.playerId;
              if (playerScores[playerId]) {
                switch (feature.type) {
                  case 'Road':
                    playerScores[playerId].road += points;
                    break;
                  case 'Beach':
                    playerScores[playerId].beach += points;
                    break;
                  case 'Lighthouse':
                    playerScores[playerId].lighthouse += points;
                    break;
                }
              }
            });
          }
        }
      });
    });

    players.forEach(player => {
      const scores = playerScores[player.id];
      const playerName = player.name;

      if (scores.road > 0) {
        this.scoreMessages.push(`${playerName} unfinished roads: +${scores.road} pts`);
      }
      if (scores.beach > 0) {
        this.scoreMessages.push(`${playerName} unfinished beaches: +${scores.beach} pts`);
      }
      if (scores.lighthouse > 0) {
        this.scoreMessages.push(`${playerName} unfinished lighthouses: +${scores.lighthouse} pts`);
      }
    });

    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    sortedPlayers.forEach((player, index) => {
      const rank = index + 1;
      const rankText = rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : `${rank}th`;
      this.scoreMessages.push(`${player.name} finished ${rankText} with ${player.score} pts`);
    });

    this.scoreMessages.push('Game over!');
  }

  processFinalScoring() {
    if (this.finalized) return;
    this.finalized = true;
    const processedFeatures = new Set<string>();

    const seaScores = this.seaBeachTracker.calculateFinalSeaScores();

    for (const { playerId, points } of seaScores) {
      if (points > 0) {
        this.playerManager.addScore(playerId, points);

        const p = this.playerManager.getPlayer(playerId);
        if (p) {
          const message = `${p.name} sea expansion for +${points} pts`;
          this.scoreMessages.push(message);
          if (this.scoreMessages.length > 50) {
            this.scoreMessages.shift();
          }
        }
      }
    }

    this.board.getAllTiles().forEach(tile => {
      const regions = getRotatedRegions(tile.data.label, tile.rotation);
      regions.forEach(r => {
        if (r.type === 'Road' || r.type === 'Beach' || r.type === 'Lighthouse') {
          if (r.type === 'Lighthouse' && tile.meeple && tile.meeple.regionId === r.id) {
            const res = checkLighthouse(this.board, tile);

            if (tile.meeple) {
              this.playerManager.addScore(tile.meeple.playerId, res.score);
            }
          } else {
            const feature = findFeature(this.board, tile, r.id);
            const featureKey = feature.regions.map(fr => `${fr.tile.x},${fr.tile.y},${fr.region.id}`).sort().join('|');
            if (!processedFeatures.has(featureKey)) {
              processedFeatures.add(featureKey);
              const points = calculateScore(feature, true);

              if (feature.meeples.length > 0) {
                const maxMeeples = Math.max(...feature.meeples.map(m => m.count));
                const winners = feature.meeples.filter(m => m.count === maxMeeples);
                winners.forEach(w => {
                  this.playerManager.addScore(w.playerId, points);
                });
              }
            }
          }
        }
      });
    });

    this.addFinalScoreMessages();
  }

  private findAdjacentSeas(beachFeature: Feature): string[] {
    const adjacentSeaIds = new Set<string>();

    for (const beachFr of beachFeature.regions) {
      const tile = beachFr.tile;
      const regions = getRotatedRegions(tile.data.label, tile.rotation);
      const beachRegion = regions.find(r => r.id === beachFr.region.id);
      if (!beachRegion) continue;

      const halfEdges = getHalfEdges(beachRegion);

      for (const fEdge of halfEdges) {
        const dir = F_EDGE_DIR[fEdge];
        const nx = tile.x + dir.dx;
        const ny = tile.y + dir.dy;

        const neighborTile = this.board.getTile(nx, ny);
        if (!neighborTile) continue;

        const neighborRegions = getRotatedRegions(neighborTile.data.label, neighborTile.rotation);
        for (const seaRegion of neighborRegions) {
          if (seaRegion.type !== 'Sea') continue;

          const oppHalfEdge = dir.opposite;
          if (regionTouchesHalfEdge(seaRegion, oppHalfEdge)) {
            const seaId = getIndependentRegionId(neighborTile, seaRegion.id);
            adjacentSeaIds.add(seaId);
          }
        }
      }
    }

    return Array.from(adjacentSeaIds);
  }

  awardPoints(type: string, points: number, meeple: { playerId: number } | undefined) {
    if (meeple) {
      this.playerManager.addScore(meeple.playerId, points);

      if (type === 'Lighthouse') {
        const player = this.playerManager.getPlayer(meeple.playerId);
        if (player && points > 0) {
          const message = `${player.name} completed a lighthouse for +${points} pts`;
          this.scoreMessages.push(message);
          if (this.scoreMessages.length > 50) {
            this.scoreMessages.shift();
          }
        }
      }

      this.runtime.playSound('playScore');
    }
  }

}
