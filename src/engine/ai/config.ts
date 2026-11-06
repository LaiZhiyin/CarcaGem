// A single production policy shared by browser and server bots.
// Explicit alternative policies in the offline evaluator are benchmark baselines only.
export const GAME_AI_OPTIONS = Object.freeze({ difficulty: 'hard' as const, seed: 1 });
