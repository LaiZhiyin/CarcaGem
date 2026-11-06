// Isolated synthetic data only. Requires npm run build:server first.
import { AnalyticsStore } from '../dist-server/analytics/store.js';
import { buildReport } from '../dist-server/analytics/report.js';
import { businessDate, DAY } from '../dist-server/analytics/model.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
const directory = mkdtempSync(join(tmpdir(),'carcagem-analytics-benchmark-'));
const store = new AnalyticsStore(directory), db=store.db, now=Date.now();
try {
  const seed=performance.now();
  const fixtureIndexes=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='index' AND tbl_name='events' AND sql IS NOT NULL").all();
  for(const index of fixtureIndexes)db.exec('DROP INDEX '+index.name);
  db.transaction(()=>{
    for(let i=0;i<50;i++)store.register({visitorId:'bench_'+i,environment:'production',version:'benchmark',legacy:false,device:'mobile',browser:'safari',source:'benchmark',medium:'test',campaign:'synthetic',content:'',campaignId:'',issuedAt:now});
    db.exec(`WITH RECURSIVE n(x) AS (SELECT 0 UNION ALL SELECT x+1 FROM n WHERE x<1499) INSERT INTO sessions SELECT 's_'||x,'bench_'||(x%50),'production',${now}-((x/50)+1)*${DAY},${now}-((x/50)+1)*${DAY}+1800000,'benchmark','test','synthetic' FROM n`);
    db.exec(`WITH RECURSIVE n(x) AS (SELECT 0 UNION ALL SELECT x+1 FROM n WHERE x<999999) INSERT INTO events SELECT 'fixture_'||x,CASE x%20 WHEN 0 THEN 'screen_view' ELSE 'foreground_interval' END,${now}-((x%30)*${DAY})-(x%1800)*1000,${now},'bench_'||(x%50),'s_'||(x%1500),'production','client','benchmark','mobile','safari',CASE x%4 WHEN 0 THEN 'home' WHEN 1 THEN 'local_setup' ELSE 'game' END,'','','page_'||x,'nav_'||x,'{}' FROM n`);
    for(let i=0;i<1000;i++){
      const t=now-(i%30)*DAY-3600000;
      db.prepare('INSERT INTO games VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('local_b_'+i,'','production','benchmark','local_ai','client','bench_'+i%50,1,1,t,t+1000,t+600000,t+600000,'finished','rules_end');
      db.prepare('INSERT INTO participants VALUES (?,?,?,?)').run('local_b_'+i,1,'bench_'+i%50,0);
      for(let turn=0;turn<6;turn++)db.prepare('INSERT INTO turns VALUES (?,?,?,?,?,?,0)').run('local_b_'+i,'turn_'+turn,1,'bench_'+i%50,0,t+1000+turn*1000);
    }
  })();
  db.prepare("UPDATE meta SET value=(SELECT COUNT(*) FROM events) WHERE key='event_total'").run();
  for(const index of fixtureIndexes)db.exec(index.sql);
  db.exec("UPDATE visitors SET first_seen=(SELECT MIN(at) FROM events e WHERE e.visitor=visitors.id AND e.name='screen_view')");
  db.pragma('optimize');
  const filter={from:businessDate(now-29*DAY),to:businessDate(now)};
  const timings=[];for(let i=0;i<20;i++){const t=performance.now();buildReport(db,filter,now);timings.push(performance.now()-t);}
  const ingest=[];
  for(let i=0;i<50;i++){
    const t=performance.now();store.ingest({visitorId:'bench_'+i,environment:'production',version:'benchmark',legacy:false,device:'mobile',browser:'safari',source:'benchmark',medium:'test',campaign:'synthetic',content:'',campaignId:'',issuedAt:now},[{id:'live_'+i,name:'foreground_interval',at:now,screen:'game',props:{durationMs:15000}}]);ingest.push(performance.now()-t);
  }
  const p95=values=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1];
  console.log(JSON.stringify({events:1000000,visitors:50,games:1000,seedMs:Math.round(performance.now()-seed),reportMs:timings.map(Math.round),coldReportMs:Math.round(timings[0]),reportP95Ms:Math.round(p95(timings)),ingestP95Ms:Number(p95(ingest).toFixed(2)),reportTargetMet:p95(timings)<=2000},null,2));
} finally {store.close();rmSync(directory,{recursive:true,force:true});}
