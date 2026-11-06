export interface Player {
  id: number;
  userId?: string;
  name: string;
  color: string;
  score: number;
  meeples: number; // Explorers remaining.
  isAI: boolean;
  meepleImg: string;
  avatarImg: string;
}

export class PlayerManager {
  players: Player[] = [];
  currentIndex = 0;
  extraTurns: Record<number, number> = {};

  constructor(playerConfigs: { userId?: string; name: string; color: string; isAI: boolean; meepleImg: string; avatarImg: string }[]) {
    this.players = playerConfigs.map((config, index) => ({
      id: index + 1,
      ...config,
      score: 0,
      meeples: 8,
    }));
  }

  getCurrentPlayer(): Player {
    return this.players[this.currentIndex];
  }

  addExtraTurn(playerId: number) {
    this.extraTurns[playerId] = (this.extraTurns[playerId] || 0) + 1;
  }

  nextTurn() {
    const currentId = this.getCurrentPlayer().id;
    if (this.extraTurns[currentId] && this.extraTurns[currentId] > 0) {
      this.extraTurns[currentId]--;

    } else {
      this.currentIndex = (this.currentIndex + 1) % this.players.length;
    }
  }

  getPlayer(id: number): Player | undefined {
    return this.players.find(p => p.id === id);
  }

  getAllPlayers(): Player[] {
    return this.players;
  }

  addScore(playerId: number, points: number) {
    const player = this.getPlayer(playerId);
    if (player) player.score += points;
  }

  useMeeple(playerId: number) {
    const player = this.getPlayer(playerId);
    if (player && player.meeples > 0) player.meeples--;
  }

  returnMeeple(playerId: number) {
    const player = this.getPlayer(playerId);
    if (player && player.meeples < 8) player.meeples++;
  }
}
