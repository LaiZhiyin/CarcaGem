/* First-party, bounded, retryable collector shared by the game and player guide. */
(() => {
  if (window.CarcaGemAnalytics) return;
  const safe = { get: key => { try { return localStorage.getItem(key); } catch { return null; } }, set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* Private storage may be unavailable. */ } } };
  const uuid = () => globalThis.crypto?.randomUUID?.() || `fallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const previous = safe.get('carcagem_visitor_id');
  const visitorId = previous || 'v_' + uuid();
  safe.set('carcagem_visitor_id', visitorId);
  const pendingIdentity=safe.get('carcagem_identity_pending')||(previous&&!safe.get('carcagem_v2_identity')?'legacy':'new');
  safe.set('carcagem_identity_pending',pendingIdentity);
  const legacy=pendingIdentity==='legacy';
  const pageId = uuid();
  let version = document.querySelector('meta[name="carcagem-version"]')?.content || 'unknown';
  let screen = '', gameId = '', roomId = '', navigation = 0, token = '', offset = 0, bootstrap = null, sending = false, retryAt = 0, failures = 0;
  let lastForeground = performance.now(), foregroundWall = Date.now(), eventSequence = 0;
  const enabled = () => safe.get('carcagem_analytics_optout') !== '1';
  const memory = new Map();
  const pendingWrites = new Set();
  let database;
  const openDB = () => database || (database = new Promise(resolve => {
    if (!window.indexedDB) { resolve(null); return; }
    try {
      const request = indexedDB.open('carcagem_analytics_outbox', 1);
      request.onupgradeneeded = () => { const store = request.result.createObjectStore('events', { keyPath: 'id' }); store.createIndex('at', 'at'); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => resolve(null); request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  }));
  async function records() { const db = await openDB(); if (!db) return [...memory.values()]; return new Promise(resolve => { const req = db.transaction('events').objectStore('events').getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => resolve([]); }); }
  async function remove(ids) { const db = await openDB(); ids.forEach(id => memory.delete(id)); if (!db) return; await new Promise(resolve => { const tx = db.transaction('events', 'readwrite'); ids.forEach(id => tx.objectStore('events').delete(id)); tx.oncomplete = resolve; tx.onerror = resolve; }); }
  async function put(event) {
    const db = await openDB();
    if (!db) { if (memory.size >= 500) memory.delete(memory.keys().next().value); memory.set(event.id, event); return; }
    await new Promise(resolve => { const tx = db.transaction('events','readwrite'); tx.objectStore('events').put(event); tx.oncomplete = resolve; tx.onerror = resolve; });
    const all = await records(); let bytes = 0;
    const keep = [...all].sort((a,b) => b.at-a.at), drop = [];
    keep.forEach((entry,index) => { bytes += JSON.stringify(entry).length * 2; if(index>=500 || bytes>1024*1024 || entry.at<Date.now()+(entry._calibrated?offset:0)-7*86400000) drop.push(entry.id); });
    if (drop.length) { await remove(drop); safe.set('carcagem_analytics_dropped', String(Number(safe.get('carcagem_analytics_dropped') || 0) + drop.length)); }
  }
  const tokens=new Map();
  const query=new URLSearchParams(location.search),ua=navigator.userAgent;
  const browser=/MicroMessenger/i.test(ua)?'wechat':/Edg\//.test(ua)?'edge':/Firefox|FxiOS/.test(ua)?'firefox':/Chrome|CriOS/.test(ua)?'chrome':/Safari/.test(ua)?'safari':'other';
  let referrer='';try{referrer=new URL(document.referrer).origin;}catch{}
  const pageContext={pageId,touchAt:Date.now(),legacy,version,device:/iPad|Tablet/i.test(ua)?'tablet':/Mobile|Android|iPhone/i.test(ua)?'mobile':'desktop',browser,attribution:{source:query.get('utm_source'),medium:query.get('utm_medium'),campaign:query.get('utm_campaign'),content:query.get('utm_content'),campaignId:query.get('utm_id'),referrer}};
  async function bootstrapPage(identity) {
    if(!enabled())return null;
    if(tokens.has(identity.pageId))return tokens.get(identity.pageId);
    const start=Date.now();
    try{
      const response=await fetch('/api/analytics/v2/bootstrap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitorId,...identity,touchAt:identity.touchAt+offset}),signal:AbortSignal.timeout(3000)});
      if(!response.ok)return null;
      const result=await response.json();offset=result.serverTime-(start+Date.now())/2;
      const value={token:result.token,visitorId};tokens.set(identity.pageId,value);
      safe.set('carcagem_v2_identity',visitorId);safe.set('carcagem_identity_pending','confirmed');return value;
    }catch{return null;}
  }
  async function context() {
    if(!enabled())return null;
    if(token)return {token,visitorId};
    if(bootstrap)return bootstrap;
    bootstrap=bootstrapPage(pageContext).then(value=>{if(value)token=value.token;return value;}).finally(()=>{bootstrap=null;});return bootstrap;
  }
  function event(name, props = {}, extra = {}) {
    if (!enabled() || document.location.pathname.includes('admin-dashboard')) return;
    const clientAt=Date.now();
    const record = {id:uuid(),name,at:clientAt+offset,version,screen,gameId,roomId,pageId,props:{...props,schemaVersion:1,rulesVersion:'1',viewport:innerWidth<600?'small':innerWidth<1100?'medium':'large',sequence:++eventSequence},_visitor:visitorId,_calibrated:Boolean(token),_context:pageContext,...extra};
    const writing=put(record);pendingWrites.add(writing);void writing.finally(()=>{pendingWrites.delete(writing);if(name==='game_finished'||name==='game_exit_confirmed')void flush();});void context();
  }
  async function flush(beacon = false) {
    if (!enabled() || sending || Date.now()<retryAt) return;
    sending=true;
    try {
      let ctx=await context(); if (!ctx) { retryAt=Date.now()+5000; return; }
      await Promise.allSettled([...pendingWrites]);
      const all=(await records()).map(e=>e._calibrated?e:{...e,at:e.at+offset,_calibrated:true});await remove(all.filter(e=>e._visitor!==visitorId||e.at<=Date.now()+offset-7*86400000).map(e=>e.id));const batch=all.filter(e=>e._visitor===visitorId&&e.at>Date.now()+offset-7*86400000).sort((a,b)=>a.at-b.at).slice(0,30);
      if(!batch.length) return;
      const identity=batch[0]._context;if(identity){ctx=await bootstrapPage(identity);if(!ctx)throw new Error('retry');}
      const selected=batch.filter(e=>!identity||e._context?.pageId===identity.pageId);
      const body=JSON.stringify({token:ctx.token,events:selected});
      if(beacon && navigator.sendBeacon) { navigator.sendBeacon('/api/analytics/v2/events',new Blob([body],{type:'application/json'})); return; }
      const response=await fetch('/api/analytics/v2/events',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:body.length<45000,signal:AbortSignal.timeout(5000)});
      if(response.status===401){token='';tokens.clear();}
      if(!response.ok) throw new Error('retry');
      const result=await response.json(); await remove([...(result.accepted||[]),...(result.rejected||[]).map(r=>r.id)]);
      failures=0; retryAt=0;
    } catch { retryAt=Date.now()+Math.min(60000,1000*2**Math.min(++failures,6))+Math.random()*500; }
    finally { sending=false; }
  }
  function heartbeat() {
    const now=performance.now();
    if(screen && document.visibilityState!=='hidden') event('foreground_interval',{durationMs:Math.min(30000,Math.max(0,now-lastForeground))});
    lastForeground=now; foregroundWall=Date.now();
  }
  function view(next, nextGame = '', nextRoom = roomId) {
    if(screen===next && gameId===nextGame && roomId===nextRoom) return;
    heartbeat(); screen=next; gameId=nextGame; roomId=nextRoom;
    event('screen_view',{}, {navigationId:'navigation_'+ ++navigation}); void flush();
  }
  window.CarcaGemAnalytics={event,view,context,flush,setVersion:v=>{version=v;},setRoom:id=>{roomId=id;},enabled};
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden'){ const duration=Math.min(30000,Math.max(0,performance.now()-lastForeground)); if(screen) event('foreground_interval',{durationMs:duration}); void flush(true); } lastForeground=performance.now(); });
  window.addEventListener('pagehide',()=>void flush(true));
  window.addEventListener('online',()=>{retryAt=0;void flush();});
  window.addEventListener('error',e=>{ if(e.target instanceof HTMLImageElement || e.target instanceof HTMLScriptElement || e.target instanceof HTMLLinkElement) event('resource_failed',{reason:'asset_load_failed',kind:e.target.tagName.toLowerCase()}); else event('app_error',{reason:'javascript_error'}); },true);
  window.addEventListener('unhandledrejection',()=>event('app_error',{reason:'unhandled_rejection'}));
  setInterval(()=>{if(Date.now()-foregroundWall>30000){lastForeground=performance.now();foregroundWall=Date.now();}heartbeat();},15000);
  setInterval(()=>void flush(),5000);
  const dropped=Number(safe.get('carcagem_analytics_dropped')||0); if(dropped){event('queue_dropped',{count:dropped});safe.set('carcagem_analytics_dropped','0');}
  if(location.pathname==='/player-guide.html') {
    view('guide'); event('guide_viewed');
    if('IntersectionObserver' in window){const seen=new Set(); const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting&&!seen.has(entry.target.id)){seen.add(entry.target.id);event('guide_section_viewed',{section:entry.target.id});}}),{threshold:.15});document.querySelectorAll('section[id]').forEach(section=>observer.observe(section));}
  }
  window.dispatchEvent(new Event('carca_analytics_ready'));
})();
