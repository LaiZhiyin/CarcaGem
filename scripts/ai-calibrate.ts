import { readFileSync, writeFileSync } from 'node:fs';
const data = JSON.parse(readFileSync('docs/AI_BENCHMARK.json', 'utf8')) as { observations: { game: number; key: string; completed: boolean }[] };
const bins: Record<string, { completed: number; total: number; games: number }> = {}; const games = new Map<string, Set<number>>();
for (const row of data.observations.filter(r => r.game % 5 !== 0)) {
  const b = bins[row.key] ??= { completed: 0, total: 0, games: 0 }; b.total++; if (row.completed) b.completed++;
  if (!games.has(row.key)) games.set(row.key, new Set()); games.get(row.key)!.add(row.game); b.games = games.get(row.key)!.size;
}
const validation = data.observations.filter(r => r.game % 5 === 0 && bins[r.key]?.games >= 8);
const base = data.observations.filter(r => r.game % 5 !== 0); const mean = base.filter(r => r.completed).length / base.length;
let brier = 0, baseline = 0;
for (const r of validation) { const b = bins[r.key], p = (b.completed + 1) / (b.total + 2); brier += (p - Number(r.completed)) ** 2; baseline += (mean - Number(r.completed)) ** 2; }
const report = { model: 'mixed-legacy/tactical-v1; 48 root candidates; approximate unknown-order model', trainingSeeds: new Set(base.map(r => r.game)).size, validationSeeds: new Set(validation.map(r => r.game)).size, trainingRows: base.length, validationRows: validation.length, brier: brier / validation.length, constantBaselineBrier: baseline / validation.length, bins };
writeFileSync('docs/AI_CALIBRATION.json', JSON.stringify(report, null, 2));
// Only activate if held-out predictions improve over a constant base-rate estimate.
const enabled = validation.length >= 100 && report.brier < report.constantBaselineBrier;
writeFileSync('src/engine/ai/completionData.ts', '// Generated from full games by scripts/ai-calibrate.ts; see docs/AI_CALIBRATION.json.\nexport const completionBins:Record<string,{completed:number;total:number;games:number}> = ' + JSON.stringify(enabled ? bins : {}, null, 2) + ';\n');
console.log(JSON.stringify({ ...report, bins: undefined, enabled }));
