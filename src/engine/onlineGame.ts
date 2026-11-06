import { Game } from './game.js';

// Advance the server's game only after validating the actor, phase and placement.
// Treasure extra turns are computed by Game, never claimed by a client payload.
export function applyOnlineAction(game: Game, payload: unknown, userId: string): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const { by, action, data } = payload as { by?: unknown; action?: unknown; data?: Record<string, unknown> };
  if (by !== userId || game.playerManager.getCurrentPlayer().userId !== userId) return false;

  switch (action) {
    case 'ROTATE':
      if (game.state !== 'PLACE_TILE' && game.state !== 'ADJUST_TILE') return false;
      game.rotateTile(true);
      return true;
    case 'TENTATIVE_PLACE':
      if (!data || !Number.isInteger(data.x) || !Number.isInteger(data.y) ||
          Math.abs(data.x as number) > 100 || Math.abs(data.y as number) > 100) return false;
      return game.tentativePlace(data.x as number, data.y as number, true);
    case 'CONFIRM_PLACE':
      return game.confirmPlace(true);
    case 'CANCEL_PLACE':
      if (game.state !== 'ADJUST_TILE') return false;
      game.cancelPlace(true);
      return true;
    case 'PLACE_MEEPLE':
      if (!data || typeof data.regionId !== 'string' ||
          !['ADJUST_TILE', 'PLACE_MEEPLE'].includes(game.state) ||
          !game.getAvailableMeepleRegions().includes(data.regionId)) return false;
      return game.placeMeeple(data.regionId, true);
    case 'SKIP_MEEPLE':
      return game.skipMeeple(true) === true;
    default:
      return false;
  }
}
