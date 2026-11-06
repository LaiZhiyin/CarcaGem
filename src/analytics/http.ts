import express from 'express';
import type { Express, Request, RequestHandler } from 'express';
import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { AnalyticsStore } from './store.js';
import { Reporter } from './reporter.js';
import { attribution, cleanTag, idIsValid } from './model.js';
import type { VisitorContext } from './model.js';
import type { ReportFilter } from './report.js';

const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const equal = (a: string, b: string) => Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const cookie = (req: Request, name: string) => req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(name + '='))?.slice(name.length + 1) || '';
const fallbackContext = (): VisitorContext => ({ visitorId: 'unattributed_server', environment: process.env.NODE_ENV === 'production' ? 'production' : 'development', issuedAt: Date.now(), version: '', legacy: true, device: 'unknown', browser: 'unknown', source: 'unattributed', medium: 'unknown', campaign: '', content: '', campaignId: '' });

export function installAnalytics(app: Express, live: () => unknown) {
  const directory = process.env.ANALYTICS_DATA_PATH || './data';
  const store = new AnalyticsStore(directory), reporter = new Reporter(store.filename);
  const secret = process.env.ANALYTICS_SIGNING_SECRET || process.env.ANALYTICS_ADMIN_TOKEN || randomBytes(32).toString('hex');
  const password = process.env.ANALYTICS_ADMIN_PASSWORD || process.env.ANALYTICS_ADMIN_TOKEN || '';
  const passwordHash = password ? scryptSync(password, secret, 32) : null;
  const passwordRequired = passwordHash !== null;
  const sign = (text: string) => createHmac('sha256', secret).update(text).digest('base64url');
  const encode = (ctx: VisitorContext) => { const text = Buffer.from(JSON.stringify(ctx)).toString('base64url'); return text + '.' + sign(text); };
  const resolveToken = (token: unknown): VisitorContext | null => {
    if (typeof token !== 'string' || token.length > 3000) return null;
    const [text, signature] = token.split('.');
    if (!signature || !equal(sign(text), signature)) return null;
    try { const ctx = JSON.parse(Buffer.from(text, 'base64url').toString()) as VisitorContext; return idIsValid(ctx.visitorId) && Date.now() - ctx.issuedAt < 30 * 86400_000 && ctx.issuedAt <= Date.now() + 1000 ? ctx : null; } catch { return null; }
  };
  const recent = new Map<string, { n: number; end: number }>();
  function limited(key: string, max: number, ms: number): boolean {
    const now = Date.now();
    if (recent.size > 5000) for (const [k, v] of recent) if (v.end < now) recent.delete(k);
    const value = recent.get(key);
    if (!value || value.end < now) { recent.set(key, { n: 1, end: now + ms }); return false; }
    return ++value.n > max;
  }
  const originOK = (req: Request) => {
    const origin = req.get('origin');
    if (!origin) return false;
    try { const url = new URL(origin); return url.host === req.get('host'); } catch { return false; }
  };
  const adminSession = (req: Request) => store.db.prepare('SELECT csrf,expires FROM admin_sessions WHERE hash=? AND expires>?').get(hash(cookie(req, 'carca_admin')), Date.now()) as { csrf: string; expires: number } | undefined;
  const auth: RequestHandler = (req, res, next) => {
    const s = adminSession(req);
    if (!s) { res.status(401).json({ error: 'Sign in to the admin dashboard.' }); return; }
    if (req.method !== 'GET' && (!originOK(req) || !equal(req.get('x-csrf-token') || '', s.csrf))) { res.status(403).json({ error: 'Request validation failed. Please sign in again.' }); return; }
    next();
  };
  const router = express.Router();
  router.use((_, res, next) => { res.set('Cache-Control', 'no-store'); res.set('X-Content-Type-Options', 'nosniff'); next(); });
  router.get('/auth-config', (_, res) => res.json({ passwordRequired }));
  router.post('/bootstrap', (req, res) => {
    if (!originOK(req)) { res.status(403).json({ error: 'Invalid origin' }); return; }
    if (limited('boot:' + req.ip, 240, 60_000)) { res.status(429).json({ error: 'Too many requests' }); return; }
    const data = req.body || {};
    if (!idIsValid(data.visitorId)) { res.status(400).json({ error: 'Invalid visitor' }); return; }
    const internal = cookie(req, 'carca_internal') === sign('internal');
    const ctx: VisitorContext = {
      visitorId: data.visitorId, environment: process.env.NODE_ENV === 'production' ? internal ? 'internal' : 'production' : 'development', issuedAt: Date.now(),
      touchAt: Math.min(Date.now(), Math.max(Date.now()-7*86400000, Number(data.touchAt)||Date.now())), pageId: idIsValid(data.pageId)?data.pageId:undefined,
      legacy: Boolean(data.legacy), version: typeof data.version === 'string' ? data.version.slice(0, 24) : 'unknown',
      device: ['desktop','mobile','tablet'].includes(data.device) ? data.device : 'unknown',
      browser: ['chrome','safari','edge','firefox','wechat','other'].includes(data.browser) ? data.browser : 'other',
      ...attribution(data.attribution && typeof data.attribution === 'object' ? data.attribution : {}, req.get('host') || ''),
    };
    store.register(ctx); store.touch(ctx); res.json({ token: encode(ctx), serverTime: Date.now(), context: { environment: ctx.environment } });
  });
  router.post('/events', (req, res) => {
    if (!originOK(req)) { res.status(403).json({ error: 'Invalid origin' }); return; }
    const ctx = resolveToken(req.body?.token);
    if (!ctx) { res.status(401).json({ error: 'Collector token expired' }); return; }
    if (limited('event:' + ctx.visitorId, 180, 60_000)) { res.status(429).json({ error: 'Too many requests' }); return; }
    const events = req.body?.events;
    if (!Array.isArray(events) || events.length > 30 || !events.length) { res.status(400).json({ error: 'Invalid event batch' }); return; }
    try { res.json(store.ingest(ctx, events)); } catch { res.status(503).json({ error: 'Analytics collection is temporarily unavailable.' }); }
  });
  router.post('/login', (req, res) => {
    if (!originOK(req)) { res.status(403).json({ error: 'Invalid request origin.' }); return; }
    if (passwordRequired) {
      if (limited('login:' + req.ip, 8, 15 * 60_000)) { res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' }); return; }
      if (typeof req.body?.password !== 'string' || req.body.password.length > 256 || !timingSafeEqual(scryptSync(req.body.password, secret, 32), passwordHash!)) { res.status(401).json({ error: 'Incorrect password.' }); return; }
    } else if (limited('passwordless-login:' + req.ip, 120, 60_000)) {
      res.status(429).json({ error: 'Too many dashboard sessions. Try again shortly.' }); return;
    }
    const token = randomBytes(32).toString('base64url'), csrf = randomBytes(24).toString('base64url');
    store.db.prepare('DELETE FROM admin_sessions WHERE expires<?').run(Date.now());
    store.db.prepare('INSERT INTO admin_sessions VALUES (?,?,?)').run(hash(token), csrf, Date.now() + 8 * 3600_000);
    res.cookie('carca_admin', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/analytics/v2', maxAge: 8 * 3600_000 });
    store.db.prepare('INSERT INTO audit(at,action,detail) VALUES (?,?,?)').run(Date.now(), 'admin_login', 'success');
    res.json({ csrf });
  });
  router.get('/session', auth, (req, res) => res.json({ csrf: adminSession(req)!.csrf }));
  router.post('/logout', auth, (req, res) => { store.db.prepare('DELETE FROM admin_sessions WHERE hash=?').run(hash(cookie(req, 'carca_admin'))); res.clearCookie('carca_admin', { path: '/api/analytics/v2' }); res.json({ ok: true }); });
  router.post('/internal', auth, (req, res) => { store.db.prepare('INSERT INTO audit(at,action,detail) VALUES (?,?,?)').run(Date.now(), 'internal_mark', String(Boolean(req.body?.enabled))); res.cookie('carca_internal', req.body?.enabled ? sign('internal') : '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: req.body?.enabled ? 365 * 86400_000 : 0 }); res.json({ ok: true, enabled: Boolean(req.body?.enabled) }); });
  router.get('/report', auth, async (req, res) => {
    const filter: ReportFilter = { from: String(req.query.from || ''), to: String(req.query.to || '') };
    for (const key of ['env','source','campaign','device','browser','version','mode'] as const) { if (req.query[key] !== undefined && (typeof req.query[key] !== 'string' || String(req.query[key]).length > 100)) { res.status(400).json({ error: 'Invalid filter parameter.' }); return; } if (req.query[key]) filter[key] = String(req.query[key]); }
    if (req.query.until !== undefined) filter.until = Number(req.query.until);
    try { const result = await reporter.query(filter); res.json({ ...(result as object), live: live() }); } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : 'Report service error.' }); }
  });
  router.post('/audit', auth, (req,res) => { store.db.prepare('INSERT INTO audit(at,action,detail) VALUES (?,?,?)').run(Date.now(),'csv_export',cleanTag(req.body?.tab)+' '+String(req.body?.filters||'').slice(0,1200));res.json({ok:true}); });
  router.get('/campaigns', auth, (_, res) => res.json(store.db.prepare('SELECT * FROM campaigns ORDER BY created DESC LIMIT 300').all()));
  router.post('/campaigns', auth, (req, res) => {
    const body = req.body || {}, tags = attribution(body);
    if (!cleanTag(body.source) || !cleanTag(body.medium) || !cleanTag(body.campaign) || typeof body.name !== 'string' || !body.name.trim() || body.name.length > 80) { res.status(400).json({ error: 'Enter a campaign name, source, medium, and campaign tag.' }); return; }
    const id = 'campaign_' + randomUUID().slice(0, 8);
    store.db.prepare('INSERT INTO campaigns VALUES (?,?,?,?,?,?,?)').run(id, body.name.trim(), tags.source, tags.medium, tags.campaign, tags.content, Date.now());
    store.db.prepare('INSERT INTO audit(at,action,detail) VALUES (?,?,?)').run(Date.now(), 'campaign_created', id);
    res.json({ id });
  });
  router.get('/qr/:id', auth, async (req, res) => {
    const row = store.db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id) as Record<string, string> | undefined;
    if (!row) { res.status(404).json({ error: 'Campaign not found.' }); return; }
    const url = campaignUrl(row, req.get('origin') || `${req.protocol}://${req.get('host')}`);
    res.type('svg').send(await QRCode.toString(url, { type: 'svg', margin: 2, width: 300, errorCorrectionLevel: 'M' }));
  });
  router.get('/legacy', auth, async (_, res) => {
    // The report worker owns legacy reads; no legacy writes or synchronous scans on the game loop.
    try { res.json(await reporter.queryLegacy(path.join(directory, 'analytics.db'))); } catch { res.status(503).json({ error: 'Legacy data is temporarily unavailable.' }); }
  });
  router.get('/history', auth, async (_, res) => { try { res.json(await reporter.queryHistory()); } catch { res.status(503).json({ error: 'Historical summaries are temporarily unavailable.' }); } });
  router.use((error: Error, _req: Request, res: express.Response, _next: express.NextFunction) => { void error; void _next; res.status(503).json({ error: 'Analytics service is temporarily unavailable.' }); });
  router.use((_, res) => res.status(404).json({ error: 'Analytics endpoint not found' }));
  app.use('/api/analytics/v2', router);
  app.use('/api/analytics', (_, res) => res.status(410).json({ error: 'The analytics API has moved to dashboard v2.' }));
  app.get('/admin-dashboard.html', (_, res) => { res.set('X-Robots-Tag', 'noindex, nofollow'); res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"); res.set('Referrer-Policy', 'same-origin'); res.set('Cache-Control', 'no-store'); res.sendFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist/admin-dashboard.html')); });
  // Persist a truthful restart marker rather than classifying interrupted games as completions.
  store.db.prepare("UPDATE rooms SET closed=?,reason='service_restart' WHERE closed IS NULL").run(Date.now());
  store.db.prepare("UPDATE games SET status='interrupted',reason='service_restart',ended=? WHERE source_type='server' AND finished IS NULL AND status='started'").run(Date.now());
  return { store, resolveToken, fallbackContext };
}

export function campaignUrl(row: Record<string, string>, baseUrl = 'http://localhost'): string {
  const url = new URL('/', baseUrl);
  for (const [key, field] of [['utm_source','source'],['utm_medium','medium'],['utm_campaign','campaign'],['utm_content','content'],['utm_id','id']]) if (row[field]) url.searchParams.set(key, row[field]);
  return url.href;
}
