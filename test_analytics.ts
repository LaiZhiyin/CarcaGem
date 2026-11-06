// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { maintainAnalytics } from './src/analytics/maintenance';
import { AnalyticsStore } from './src/analytics/store';
import { buildReport } from './src/analytics/report';
import { DAY, attribution, businessDate, dateStart } from './src/analytics/model';
import type { AnalyticsEvent, VisitorContext } from './src/analytics/model';
import { Game } from './src/engine/game';
import { isValidPlacement } from './src/engine/validator';
import type { GameTelemetry } from './src/analytics/model';

let store: AnalyticsStore, directory: string;
const now = Date.parse('2026-10-24T12:00:00+08:00');
const context = (id = 'visitor_a', source = 'social'): VisitorContext => ({ visitorId: id, environment: 'production', issuedAt: now, version: '1.0.4', device: 'mobile', browser: 'safari', legacy: false, source, medium: 'organic_social', campaign: 'launch', content: 'post_a', campaignId: 'campaign1' });
let sequence = 0;
const event = (name: string, at: number, extra: Partial<AnalyticsEvent> = {}): AnalyticsEvent => ({ id: 'event_' + ++sequence, name, at, ...extra });
function ingest(ctx: VisitorContext, e: AnalyticsEvent | AnalyticsEvent[]) { const rows = Array.isArray(e) ? e : [e]; return store.ingest(ctx, rows, 'client', Math.max(now, ...rows.map(x => x.at))); }
function atDay(ctx: VisitorContext, day: number) {
  const at = now - day * DAY;
  return store.ingest(ctx, [event('screen_view', at, { screen: 'home', pageId: 'page_'+sequence, navigationId: 'nav_'+sequence })], 'client', at);
}
function local(ctx: VisitorContext, id: string, at = now, seats = [false, true]) { return store.ingest(ctx, [event('game_started', at, { gameId: id, props: { seats } })], 'client', at); }
function turn(ctx: VisitorContext, gameId: string, id: string, at = now, seat = 1) { return store.ingest(ctx, [event('turn_committed', at, { gameId, props: { turnId: id, seat } })], 'client', at); }
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'carcagem-analytics-')); store = new AnalyticsStore(directory); });
afterEach(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });

describe('analytics event and game invariants', () => {
  it('counts three page navigations as PV3, UV1 and one cross-tab session; deduplicates StrictMode navigation and retries', () => {
    const ctx = context();
    const first = event('screen_view', now, { screen: 'home', pageId: 'page1', navigationId: 'nav1' });
    expect(ingest(ctx, first).accepted).toHaveLength(1);
    for (let i = 0; i < 100; i++) ingest(ctx, first);
    ingest(ctx, { ...first, id: 'strictmode_duplicate' });
    ingest(ctx, event('screen_view', now+1, { screen: 'home', pageId: 'page2', navigationId: 'nav1' }));
    ingest(ctx, event('screen_view', now+2, { screen: 'local_setup', pageId: 'page2', navigationId: 'nav2' }));
    const result = buildReport(store.db, { from:'2026-10-24',to:'2026-10-24' }, now+100);
    expect(result.overview).toMatchObject({ pv:3,uv:1,newVisitors:1 });
    expect(store.db.prepare('SELECT COUNT(*) n FROM sessions').get()).toEqual({ n:1 });
  });
  it('records one online game for two browsers and an AI; source-filtered active counts only the matching actor', () => {
    const a=context('a','source_a'), b=context('b','source_b'); atDay(a,0);atDay(b,0);
    store.startOnline('online_one','room_one',a,[{visitor:'a',ai:false},{visitor:'b',ai:false},{visitor:null,ai:true}],now);
    store.turn('online_one','t1',1,now+1);store.turn('online_one','t2',2,now+2);store.turn('online_one','t3',3,now+3);
    const report=buildReport(store.db,{from:'2026-10-24',to:'2026-10-24'},now+100);
    expect(report.overview).toMatchObject({started:1,active:2,effective:1});
    expect(report.games[0]).toMatchObject({humans:2,ais:1,browsers:2});
    expect(buildReport(store.db,{from:'2026-10-24',to:'2026-10-24',source:'source_a'},now+100).overview.active).toBe(1);
    expect(ingest(a,event('game_finished',now,{gameId:'online_one'})).rejected[0].reason).toBe('online_events_are_server_owned');
  });
  it('rejects four seats and unconfigured seats without persisting a partial event',()=>{
    const c=context();
    expect(local(c,'local_four',now,[false,false,true,true]).rejected).toHaveLength(1);
    local(c,'local_valid');
    expect(turn(c,'local_valid','bad',now+1,3).rejected).toHaveLength(1);
    expect(store.db.prepare("SELECT COUNT(*) n FROM events WHERE name='turn_committed'").get()).toEqual({n:0});
  });
  it('joins late page events into the same session and measures activation without counting AI as first turn',()=>{
    const c=context();atDay(c,0);
    ingest(c,event('screen_view',now-1000,{screen:'home',pageId:'late_page',navigationId:'late_nav'}));
    local(c,'local_latency',now);turn(c,'local_latency','ai_first',now+100,2);turn(c,'local_latency','human_first',now+1000,1);
    const report=buildReport(store.db,{from:'2026-10-24',to:'2026-10-24'},now+2000);
    expect(store.db.prepare('SELECT COUNT(*) n FROM sessions').get()).toEqual({n:1});
    expect(report.experience).toMatchObject({activationSamples:1,activationP50:2000,firstTurnSamples:1,firstTurnP50:1000});
  });
  it('keeps local human seats separate from visitors, retracts net turns and reopens a finished game', () => {
    const ctx=context();atDay(ctx,0);local(ctx,'local_one',now,[false,false]);
    for(let i=1;i<=3;i++)turn(ctx,'local_one','t'+i,now+i,i===2?2:1);
    expect(buildReport(store.db,{from:'2026-10-24',to:'2026-10-24'},now+100).overview.deep).toBe(1);
    ingest(ctx,event('turn_retracted',now+4,{gameId:'local_one',props:{turnId:'t3'}}));
    expect(buildReport(store.db,{from:'2026-10-24',to:'2026-10-24'},now+100).overview.deep).toBe(0);
    ingest(ctx,event('game_finished',now+5,{gameId:'local_one'}));
    expect(buildReport(store.db,{from:'2026-10-24',to:'2026-10-24'},now+100).overview.deep).toBe(1);
    ingest(ctx,event('game_reopened',now+6,{gameId:'local_one'}));
    const result=buildReport(store.db,{from:'2026-10-24',to:'2026-10-24'},now+100);
    expect(result.overview).toMatchObject({started:1,active:1,finishes:0,deep:0});
    expect(result.games[0]).toMatchObject({humans:2,browsers:1});
  });
  it('handles out-of-order turn, retraction, then start without phantom active players',()=>{
    const ctx=context();atDay(ctx,0);
    turn(ctx,'local_order','one',now+1);
    ingest(ctx,event('turn_retracted',now+2,{gameId:'local_order',props:{turnId:'one'}}));
    local(ctx,'local_order',now);
    const result=buildReport(store.db,{from:'2026-10-24',to:'2026-10-24'},now+100);
    expect(result.overview).toMatchObject({started:1,active:0,effective:0});
  });
  it('does not accept another visitor modifying a local game; AI-only play is not human growth',()=>{
    const a=context(),b=context('b');atDay(a,0);local(a,'local_owned');
    expect(turn(b,'local_owned','forged').rejected[0].reason).toBe('game_owner_mismatch');
    local(a,'local_ai',now,[true,true]);turn(a,'local_ai','ai',now+1);
    expect(buildReport(store.db,{from:'2026-10-24',to:'2026-10-24'},now+100).overview).toMatchObject({started:1,active:0});
  });
  it('merges foreground intervals across tabs and caps missing heartbeat time',()=>{
    const c=context();atDay(c,0);local(c,'local_intervals');
    ingest(c,[event('foreground_interval',now,{gameId:'local_intervals',screen:'game',props:{durationMs:15000}}),event('foreground_interval',now+5000,{gameId:'local_intervals',screen:'game',props:{durationMs:15000}}),event('foreground_interval',now+10000,{gameId:'local_intervals',screen:'game',props:{durationMs:999999}})]);
    expect(buildReport(store.db,{from:'2026-10-24',to:'2026-10-24'},now+20000).overview.foregroundMs).toBe(30000);
  });
});

describe('calendar, maturity and attribution',()=>{
  it('uses Shanghai midnight, valid dates and exactly seven chart days',()=>{
    expect(businessDate(Date.parse('2026-10-23T16:00:00Z'))).toBe('2026-10-24');
    expect(()=>dateStart('2026-02-30')).toThrow();
    expect(buildReport(store.db,{from:'2026-10-18',to:'2026-10-24'},now).trend).toHaveLength(7);
    expect(()=>buildReport(store.db,{from:'2026-10-25',to:'2026-10-24'},now)).toThrow();
  });
  it('does not include unfinished observation windows in 24h completion or D7 denominators',()=>{
    const c=context();atDay(c,0);local(c,'local_recent');turn(c,'local_recent','one',now+1);
    const result=buildReport(store.db,{from:'2026-10-24',to:'2026-10-24'},now+100);
    expect(result.overview.mature).toBe(0);expect(result.retention[0].mature7).toBe(0);
  });
  it('anchors completion to effective start even when the game engine started on a prior day',()=>{
    const c=context();atDay(c,3);local(c,'local_cross',now-3*DAY);turn(c,'local_cross','one',now-2*DAY);
    store.ingest(c,[event('game_finished',now-2*DAY+1000,{gameId:'local_cross'})],'client',now-2*DAY+1000);
    expect(buildReport(store.db,{from:'2026-10-22',to:'2026-10-22'},now).overview).toMatchObject({started:0,mature:1,completed24h:1});
  });
  it('counts exact-day retention and does not reset first-play cohort when filtering a new version',()=>{
    const c=context();atDay(c,8);local(c,'local_first',now-8*DAY);turn(c,'local_first','first',now-8*DAY);
    const updated={...c,version:'fixture-version'};local(updated,'local_return',now-DAY);turn(updated,'local_return','return',now-DAY);
    const report=buildReport(store.db,{from:'2026-10-16',to:'2026-10-24'},now);
    expect(report.retention[0]).toMatchObject({size:1,mature7:1,retained7:1});
    expect(buildReport(store.db,{from:'2026-10-16',to:'2026-10-24',version:'fixture-version'},now).retention).toHaveLength(0);
  });
  it('retains first acquisition and does not infer unknown social sources',()=>{
    const c=context();atDay(c,0);store.register({...c,source:'different'});
    expect(store.db.prepare('SELECT source FROM visitors WHERE id=?').get(c.visitorId)).toEqual({source:'social'});
    expect(attribution({referrer:'https://example.test/player-guide.html'}, 'example.test').source).toBe('direct_unknown');
    expect(attribution({source:'XiaoHongShu',medium:'organic_social',campaign:'Launch'})).toMatchObject({source:'xiaohongshu',campaign:'launch'});
  });
});

describe('game telemetry does not change rules',()=>{
  it('emits no tentative/rotation commits and retracts actual committed turns on undo',()=>{
    const game=new Game([{name:'A',color:'red',isAI:false,meepleImg:'',avatarImg:''},{name:'B',color:'blue',isAI:false,meepleImg:'',avatarImg:''}]);
    const events:GameTelemetry[]=[];game.onTelemetry=e=>events.push(e);game.start();
    const slot=game.board.getAvailableSlots().flatMap(s=>[0,90,180,270].map(rotation=>({...s,rotation}))).find(s=>isValidPlacement(game.board,s.x,s.y,game.currentTile!,s.rotation))!;
    game.currentRotation=slot.rotation;expect(game.tentativePlace(slot.x,slot.y)).toBe(true);expect(events).toHaveLength(0);
    expect(game.skipMeeple()).toBe(true);expect(events.filter(e=>e.name==='turn_committed')).toHaveLength(1);
    game.undo();expect(events.filter(e=>e.name==='turn_retracted')).toHaveLength(1);
  });
});

describe('review regressions: delayed evidence and archives',()=>{
  it('does not let a late finish override a newer reopen, then accepts a new terminal result',()=>{
    const c=context();local(c,'local_late');
    ingest(c,event('game_reopened',now+30,{gameId:'local_late'}));
    ingest(c,event('game_finished',now+20,{gameId:'local_late'}));
    expect(store.db.prepare('SELECT status,finished FROM games WHERE id=?').get('local_late')).toEqual({status:'started',finished:null});
    ingest(c,event('game_finished',now+40,{gameId:'local_late'}));
    expect(store.db.prepare('SELECT status,finished FROM games WHERE id=?').get('local_late')).toEqual({status:'finished',finished:now+40});
  });
  it('keeps later-session turns out of an earlier session funnel',()=>{
    const c=context();atDay(c,0);
    ingest(c,event('screen_view',now+1,{screen:'local_setup',pageId:'funnel_page',navigationId:'setup'}));
    local(c,'local_funnel',now+2);
    ingest(c,event('game_viewed',now+3,{gameId:'local_funnel',screen:'game'}));
    turn(c,'local_funnel','later',now+31*60000);
    const report=buildReport(store.db,{from:'2026-10-24',to:'2026-10-24'},now+32*60000);
    expect(report.journeys.find(j=>j.key==='local')!.steps.map(s=>s.count)).toEqual([1,1,1,0,0]);
  });
  it('does not qualify an earlier session as deep when a later session finishes the same game',()=>{
    const c=context();atDay(c,0);
    ingest(c,event('screen_view',now+1,{screen:'local_setup',pageId:'finish_page',navigationId:'setup'}));
    local(c,'local_split_finish',now+2);ingest(c,event('game_viewed',now+3,{gameId:'local_split_finish',screen:'game'}));turn(c,'local_split_finish','first',now+4);
    ingest(c,event('game_finished',now+31*60000,{gameId:'local_split_finish'}));
    const r=buildReport(store.db,{from:'2026-10-24',to:'2026-10-24'},now+32*60000);
    expect(r.journeys.find(j=>j.key==='local')!.steps.map(s=>s.count)).toEqual([1,1,1,1,0]);
  });
  it('preserves full Shanghai calendar day history across repeated pruning and validates a restorable backup',async()=>{
    const c=context(),day=dateStart('2026-07-26');
    store.ingest(c,[event('screen_view',day+1000,{screen:'home',pageId:'archive_a',navigationId:'one'}),event('screen_view',day+20*3600000,{screen:'home',pageId:'archive_b',navigationId:'two'})],'client',day+20*3600000);
    await maintainAnalytics(store.filename,day+90*DAY+12*3600000);
    await maintainAnalytics(store.filename,day+90*DAY+18*3600000);
    expect(store.db.prepare('SELECT pv,uv FROM daily_history WHERE day=?').get('2026-07-26')).toEqual({pv:2,uv:1});
    await maintainAnalytics(store.filename,day+91*DAY+12*3600000);
    expect(store.db.prepare('SELECT pv,uv FROM daily_history WHERE day=?').get('2026-07-26')).toEqual({pv:2,uv:1});
    const filename=readdirSync(join(directory,'backups')).find(f=>f.endsWith('.sqlite'))!;
    const restored=new Database(join(directory,'backups',filename),{readonly:true});
    expect(restored.pragma('quick_check',{simple:true})).toBe('ok');restored.close();
    expect(store.db.prepare("SELECT value FROM meta WHERE key='event_total'").get()).toEqual({value:'0'});
    expect(store.db.prepare('SELECT COUNT(*) n FROM events').get()).toEqual({n:0});
  });
  it('restores an older acquisition touch after direct-page bootstrap without changing history into new traffic',()=>{
    const direct={...context(),source:'direct_unknown',touchAt:now,pageId:'direct'};store.register(direct);store.touch(direct);
    const old={...context(),source:'offline_campaign',legacy:true,touchAt:now-1000,pageId:'campaign'};store.register(old);store.touch(old);store.touch(old);
    expect(store.db.prepare('SELECT source,kind FROM visitors WHERE id=?').get(old.visitorId)).toEqual({source:'offline_campaign',kind:'historical_unknown'});
    expect(store.db.prepare('SELECT COUNT(*) n FROM touches').get()).toEqual({n:2});
  });
});

it('backfills the current version catalog from existing analytics events',()=>{
  const c=context();ingest(c,event('screen_view',now,{screen:'home',pageId:'version_page',navigationId:'nav',version:'1.0.4'}));
  expect(store.db.prepare('SELECT version FROM app_versions ORDER BY version').all()).toEqual([{version:'1.0.4'}]);
  store.db.exec('DROP TABLE app_versions');store.close();store=new AnalyticsStore(directory);
  expect(buildReport(store.db,{from:'2026-10-24',to:'2026-10-24'},now).options.versions).toContainEqual({label:'1.0.4'});
});
