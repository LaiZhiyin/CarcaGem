// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { businessDate } from './src/analytics/model';
import { Game } from './src/engine/game';
import { isValidPlacement } from './src/engine/validator';
import { applyOnlineAction } from './src/engine/onlineGame';
import type { OnlineAction } from './src/engine/gameRuntime';

let server: ChildProcess, base: string, cookie = '', csrf = '';
const directory = mkdtempSync(join(tmpdir(), 'analytics-api-'));
const sockets: Socket[] = [];
const today = businessDate(Date.now());
beforeAll(async () => {
  const probe=createServer();await new Promise<void>((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});
  const port=(probe.address() as {port:number}).port;await new Promise<void>(resolve=>probe.close(()=>resolve()));base='http://127.0.0.1:'+port;
  server=spawn(process.execPath,['dist-server/server.js'],{env:{...process.env,NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(port),ANALYTICS_DATA_PATH:directory,ANALYTICS_ADMIN_PASSWORD:'test-only-admin-password',ANALYTICS_SIGNING_SECRET:'test-only-signing-secret'},stdio:['ignore','pipe','pipe']});
  await new Promise<void>((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(new Error(log||'Server timed out')),8000);server.stdout!.on('data',chunk=>{log+=chunk;if(log.includes('Server running on 127.0.0.1:')){clearTimeout(timer);resolve();}});server.stderr!.on('data',chunk=>{log+=chunk;});server.once('exit',()=>{clearTimeout(timer);reject(new Error(log));});});
});
afterAll(async()=>{sockets.forEach(s=>s.disconnect());if(server?.exitCode===null)await new Promise<void>(resolve=>{server.once('exit',()=>resolve());server.kill();});rmSync(directory,{recursive:true,force:true});});
async function request(path:string, body?:unknown, admin=false, custom?:Record<string,string>){return fetch(base+'/api/analytics/v2'+path,{method:body===undefined?'GET':'POST',headers:{Origin:base,...(body===undefined?{}:{'Content-Type':'application/json'}),...(admin?{Cookie:cookie,'X-CSRF-Token':csrf}:{}),...custom},body:body===undefined?undefined:JSON.stringify(body)});}
async function bootstrap(visitorId:string){const response=await request('/bootstrap',{visitorId,legacy:false,version:'1.0.4',device:'mobile',browser:'safari',attribution:{source:'integration',medium:'test',campaign:'release'}});expect(response.status).toBe(200);return (await response.json()).token as string;}

it('protects reports, creates revocable HttpOnly sessions and enforces CSRF',async()=>{
  expect((await request('/report?from='+today+'&to='+today)).status).toBe(401);
  expect((await request('/login',{password:'wrong'})).status).toBe(401);
  const response=await request('/login',{password:'test-only-admin-password'});expect(response.status).toBe(200);
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');cookie=response.headers.get('set-cookie')!.split(';')[0];csrf=(await response.json()).csrf;
  expect((await request('/campaigns',{name:'test',source:'x',medium:'organic_social',campaign:'launch'},false,{Cookie:cookie})).status).toBe(403);
  const campaign=await request('/campaigns',{name:'Test campaign',source:'x',medium:'organic_social',campaign:'launch'},true);expect(campaign.status).toBe(200);
  const id=(await campaign.json()).id;const qr=await request('/qr/'+id,undefined,true);expect(qr.headers.get('content-type')).toContain('svg');expect(await qr.text()).toContain('<svg');
  const session=await request('/session',undefined,true);expect(session.status).toBe(200);
});

it('ingests idempotently, rejects forged online facts and serves a real dashboard instead of SPA fallback',async()=>{
  const token=await bootstrap('browser_api');const e={id:'api_page',name:'screen_view',at:Date.now(),screen:'home',pageId:'api_page_1',navigationId:'api_nav_1'};
  for(let i=0;i<2;i++)expect((await request('/events',{token,events:[e]})).status).toBe(200);
  const invalid=await request('/events',{token,events:[{id:'forged',name:'game_started',at:Date.now(),gameId:'online_forged',props:{seats:[false,false]},source:'server'}]});
  expect((await invalid.json()).rejected[0].reason).toBe('online_events_are_server_owned');
  const report=await request('/report?from='+today+'&to='+today+'&env=development',undefined,true);expect(report.status).toBe(200);expect((await report.json()).overview).toMatchObject({pv:1,uv:1,started:0});
  const html=await (await fetch(base+'/admin-dashboard.html')).text();expect(html).toContain('CarcaGem · Analytics');expect(html).toContain('login-panel');expect(html).not.toContain('src="/analytics-client.js"');
  const missing=await request('/does-not-exist',undefined,true);expect(missing.status).toBe(404);expect(missing.headers.get('content-type')).toContain('json');
  expect((await fetch(base+'/api/analytics/pageview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitorId:'legacy',device:'pc'})})).status).toBe(410);
});

function ack(socket:Socket,name:string,...args:unknown[]):Promise<Record<string,unknown>>{return new Promise((resolve,reject)=>socket.timeout(3000).emit(name,...args,(error:Error|null,response:Record<string,unknown>)=>error?reject(error):resolve(response)));}
function nextEvent(socket:Socket,type:string){return new Promise<Record<string,unknown>>((resolve,reject)=>{const timer=setTimeout(()=>{socket.off('game-event',handler);reject(new Error('Missing '+type));},4000);const handler=(e:Record<string,unknown>)=>{if(e.type===type){clearTimeout(timer);socket.off('game-event',handler);resolve(e);}};socket.on('game-event',handler);});}
it('counts a two-browser online game once, links real turns and records host interruption',async()=>{
  const ids=['online_a','online_b'],tokens=await Promise.all(ids.map(bootstrap));
  for(const token of tokens){const socket=io(base,{auth:{analyticsToken:token},transports:['websocket'],reconnection:false});sockets.push(socket);await new Promise<void>((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});}
  const [a,b]=sockets;
  expect(await ack(a,'join-room','54321',{userId:ids[0],displayName:'A',isHost:true,ready:true})).toHaveProperty('success',true);
  expect(await ack(b,'join-room','54321',{userId:ids[1],displayName:'B',ready:true})).toHaveProperty('success',true);
  const ready=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('presence timeout')),3000);a.on('presence-sync',members=>{if(members.length===2&&members.every((m:{colorKey?:string})=>m.colorKey)){clearTimeout(timer);resolve();}});});
  a.emit('update-presence','54321',ids[0],{colorKey:'red',color:'#e74c3c'});b.emit('update-presence','54321',ids[1],{colorKey:'yellow',color:'#f1c40f'});await ready;
  const p1=nextEvent(a,'GAME_START'),p2=nextEvent(b,'GAME_START');const players=[{userId:ids[0],colorKey:'red'},{userId:ids[1],colorKey:'yellow'}];
  a.emit('broadcast-event','54321',{type:'GAME_START',payload:{seed:17526,players}});
  const events=await Promise.all([p1,p2]);const payload=events[0].payload as {gameId:string};expect((events[1].payload as {gameId:string}).gameId).toBe(payload.gameId);
  const mirror=new Game(ids.map(userId=>({userId,name:userId,color:'',isAI:false,meepleImg:'',avatarImg:''})),17526);mirror.start();
  for(let i=0;i<2;i++){
    const actor=mirror.playerManager.getCurrentPlayer(),sender=actor.userId===ids[0]?a:b,receiver=sender===a?b:a;
    const slot=mirror.board.getAvailableSlots().flatMap(p=>[0,90,180,270].map(rotation=>({...p,rotation}))).find(p=>isValidPlacement(mirror.board,p.x,p.y,mirror.currentTile!,p.rotation))!;
    const send=async(action:OnlineAction)=>{const delivery=nextEvent(receiver,'ACTION');expect(applyOnlineAction(mirror,action,actor.userId!)).toBe(true);sender.emit('broadcast-event','54321',{type:'ACTION',payload:action});await delivery;};
    for(let n=0;n<slot.rotation/90;n++)await send({by:actor.userId!,action:'ROTATE'});
    await send({by:actor.userId!,action:'TENTATIVE_PLACE',data:{x:slot.x,y:slot.y}});await send({by:actor.userId!,action:'SKIP_MEEPLE'});
  }
  const report=await (await request('/report?from='+today+'&to='+today+'&env=development',undefined,true)).json();expect(report.overview).toMatchObject({started:1,effective:1,active:2});expect(report.games[0]).toMatchObject({browsers:2,humans:2,source_type:'server'});
  const closed=new Promise<void>(resolve=>b.on('presence-sync',members=>{if(!members.length)resolve();}));a.disconnect();await closed;
  const after=await (await request('/report?from='+today+'&to='+today+'&env=development',undefined,true)).json();expect(after.games[0]).toMatchObject({status:'interrupted',reason:'host_left'});
});

it('revokes the session on logout',async()=>{expect((await request('/logout',{},true)).status).toBe(200);expect((await request('/session',undefined,true)).status).toBe(401);});
