import type { AnalyticsEvent } from './model.js';
interface BrowserCollector {
  view: (screen: string, gameId?: string, roomId?: string) => void;
  event: (name: string, props?: Record<string, unknown>, extra?: Partial<AnalyticsEvent>) => void;
  context: () => Promise<{ token: string; visitorId: string } | null>;
  setVersion: (version: string) => void;
  setRoom: (id: string) => void;
}
declare global { interface Window { CarcaGemAnalytics?: BrowserCollector } }
function withCollector(action: (collector: BrowserCollector) => void) {
  if (window.CarcaGemAnalytics) action(window.CarcaGemAnalytics);
  else window.addEventListener('carca_analytics_ready', () => { if (window.CarcaGemAnalytics) action(window.CarcaGemAnalytics); }, { once: true });
}
export const trackScreen = (screen: string, version: string, gameId = '') => withCollector(c => { c.setVersion(version); c.view(screen, gameId); });
export const trackEvent = (name: string, props: Record<string, unknown> = {}, extra: Partial<AnalyticsEvent> = {}) => withCollector(c => c.event(name, props, extra));
export const setAnalyticsRoom = (id: string) => withCollector(c => c.setRoom(id));
export async function analyticsContext(): Promise<{ token: string; visitorId: string } | null> {
  if (!window.CarcaGemAnalytics) return null;
  return Promise.race([window.CarcaGemAnalytics.context(), new Promise<null>(resolve => setTimeout(() => resolve(null), 1200))]);
}
