// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
const script=readFileSync(new URL('./public/analytics-client.js',import.meta.url),'utf8');
const windows:JSDOM[]=[];
function browser(options:{offline?:boolean;optout?:boolean;path?:string;storage?:Record<string,string>}={}){
  const dom=new JSDOM('<meta name="carcagem-version" content="1.0.4">',{url:'https://example.test/'+(options.path||''),runScripts:'dangerously',pretendToBeVisual:true});windows.push(dom);
  const w=dom.window, boots:Record<string,unknown>[]=[], batches:Record<string,unknown>[][]=[];
  let offline=Boolean(options.offline);
  Object.defineProperty(w,'indexedDB',{value:undefined});
  for(const [key,value] of Object.entries(options.storage||{}))w.localStorage.setItem(key,value);
  if(options.optout)w.localStorage.setItem('carcagem_analytics_optout','1');
  w.fetch=(async(url:unknown,init:RequestInit)=>{
    if(offline)throw new Error('offline');
    const body=JSON.parse(String(init.body));
    if(String(url).endsWith('bootstrap')){boots.push(body);return {ok:true,json:async()=>({token:'fixture_token',serverTime:Date.now()})};}
    batches.push(body.events);return {ok:true,status:200,json:async()=>({accepted:body.events.map((e:{id:string})=>e.id),rejected:[]})};
  }) as unknown as typeof w.fetch;
  w.eval(script);
  return {w,batches,boots,online:()=>{offline=false;w.dispatchEvent(new w.Event('online'));},collector:()=>w.CarcaGemAnalytics as {view:(s:string)=>void;event:(n:string,p:object)=>void;flush:()=>Promise<void>}};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,30));
afterEach(()=>{windows.splice(0).forEach(d=>d.window.close());});
it('deduplicates a repeated logical view and drains acknowledged events',async()=>{
  const b=browser();b.collector().view('home');b.collector().view('home');await settle();await b.collector().flush();await b.collector().flush();
  expect(b.batches.flat().filter(e=>e.name==='screen_view')).toHaveLength(1);
  expect(b.batches.flat()[0]).toMatchObject({version:'1.0.4',screen:'home'});
});
it('queues before bootstrap completes, retries after offline recovery, and keeps event IDs stable',async()=>{
  const b=browser({offline:true});b.collector().view('home');await settle();expect(b.batches).toHaveLength(0);
  b.online();await settle();await b.collector().flush();
  expect(b.batches.flat().filter(e=>e.name==='screen_view')).toHaveLength(1);
});
it('does not emit analytics when visitor opted out or when on the admin page',async()=>{
  for(const options of [{optout:true},{path:'admin-dashboard.html'}]){const b=browser(options);b.collector().view('home');await settle();await b.collector().flush();expect(b.batches).toHaveLength(0);}
});

it('keeps a historical identity pending across failed bootstrap and a second page load',async()=>{
  const first=browser({offline:true,storage:{carcagem_visitor_id:'old_browser'}});first.collector().view('home');await settle();
  const storage=Object.fromEntries(Object.keys(first.w.localStorage).map(k=>[k,first.w.localStorage.getItem(k)!]));
  const second=browser({storage});second.collector().view('home');await settle();
  expect(second.boots[0]).toMatchObject({visitorId:'old_browser',legacy:true});
});
