import { completionBins } from './completionData.js';
export function completionKey(remaining: number, slots: number, compatible: number[]): string {
  return [Math.floor(remaining / 20), Math.min(4, slots), Math.min(3, Math.floor(Math.min(...compatible) / 3))].join(':');
}
export function completionEstimate(remaining: number, a: { slots: number; compatible: number[]; impossible: boolean; arrival: number }): { probability: number; model: string } {
  if (a.impossible) return { probability: 0, model: 'inventory-proof' };
  if (!a.slots) return { probability: 1, model: 'completed' };
  const bin = completionBins[completionKey(remaining, a.slots, a.compatible)];
  if (bin && bin.games >= 8) return { probability: (bin.completed + 1) / (bin.total + 2), model: 'calibrated-mixed-policy-v1' };
  return { probability: a.arrival / (1 + 0.65 * Math.max(0, a.slots - 1)), model: 'uncalibrated-heuristic' };
}
