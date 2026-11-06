export type OnlineAction =
  | { by: string; action: 'ROTATE' | 'CONFIRM_PLACE' | 'CANCEL_PLACE' | 'SKIP_MEEPLE' }
  | { by: string; action: 'TENTATIVE_PLACE'; data: { x: number; y: number } }
  | { by: string; action: 'PLACE_MEEPLE'; data: { regionId: string } };

export type GameSound = 'playError' | 'playClick' | 'playRotate' | 'playPlaceTile' | 'playPlaceMeeple' | 'playScore';

// Browser effects are injected so the server can run the same rules without DOM or sockets.
export interface GameRuntime {
  localUserId: () => string;
  onAction: (handler: (action: OnlineAction) => void) => void;
  sendAction: (action: OnlineAction) => void;
  playSound: (sound: GameSound) => void;
}

export const silentGameRuntime: GameRuntime = {
  localUserId: () => '',
  onAction: () => {},
  sendAction: () => {},
  playSound: () => {},
};
