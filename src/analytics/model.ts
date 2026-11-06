export const METRIC_VERSION = '2026-10-v1';
export const DAY = 86_400_000;
export const SESSION_GAP = 30 * 60_000;
export type Environment = 'production' | 'development' | 'internal';
export interface Attribution { source: string; medium: string; campaign: string; content: string; campaignId: string }
export interface VisitorContext extends Attribution {
  visitorId: string; environment: Environment; version: string; device: string; browser: string;
  legacy: boolean; issuedAt: number; touchAt?: number; pageId?: string;
}
export interface AnalyticsEvent {
  id: string; name: string; at: number; screen?: string; gameId?: string; roomId?: string;
  pageId?: string; navigationId?: string; version?: string; props?: Record<string, unknown>;
}
export interface GameTelemetry {
  name: 'turn_committed' | 'turn_retracted' | 'game_finished' | 'game_reopened';
  turnId?: string; seat?: number; isAI?: boolean; reason?: string; remaining?: number;
}
export const CLIENT_EVENTS = new Set([
  'screen_view', 'foreground_interval', 'mode_selected', 'guide_viewed', 'guide_section_viewed',
  'invite_code_copied', 'game_started', 'game_viewed', 'turn_committed', 'turn_retracted',
  'game_finished', 'game_reopened', 'game_exit_confirmed', 'app_error', 'resource_failed', 'connection_result', 'queue_dropped',
]);
export const SCREENS = new Set(['home', 'local_setup', 'online_setup', 'room', 'game', 'guide']);
export const idIsValid = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(v);
export function businessDate(ms: number): string { return new Date(ms + 8 * 3600_000).toISOString().slice(0, 10); }
export function dateStart(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date must use YYYY-MM-DD format.');
  const ms = Date.parse(date + 'T00:00:00+08:00');
  if (!Number.isFinite(ms) || businessDate(ms) !== date) throw new Error('Invalid date.');
  return ms;
}
export function cleanTag(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const result = value.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '_').slice(0, 80);
  return result || fallback;
}
export function attribution(input: Record<string, unknown>, requestHost = ''): Attribution {
  const source = cleanTag(input.source), medium = cleanTag(input.medium), campaign = cleanTag(input.campaign);
  if (source || medium || campaign) return { source: source || 'incomplete_utm', medium: medium || 'unknown', campaign, content: cleanTag(input.content), campaignId: cleanTag(input.campaignId) };
  let external = '';
  try {
    const host = new URL(String(input.referrer || '')).hostname.toLowerCase();
    const ownHost = requestHost ? new URL(`http://${requestHost}`).hostname.toLowerCase() : '';
    if (host !== ownHost && !/^(localhost|127\.0\.0\.1)$/.test(host)) external = cleanTag(host);
  } catch { /* No valid external referrer. */ }
  return { source: external || 'direct_unknown', medium: external ? 'referral' : 'unknown', campaign: '', content: '', campaignId: '' };
}
