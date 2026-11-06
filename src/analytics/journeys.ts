import type Database from 'better-sqlite3';
type Args = Record<string,string|number>;
type Evidence = {session:string;visitor:string;name:string;screen:string;at:number;game_id:string;room_id:string};
type Fact = {id:string;room_id:string;mode:string;started:number;finished:number|null};
/** Ordered, session-scoped evidence. Online creation and joining have separate paths. */
export function buildJourneys(db:Database.Database,args:Args,eventWhere:string,env:string,visitor:string,version:string){
  const sessions=db.prepare(`SELECT s.id,s.last_seen FROM sessions s JOIN visitors v ON v.id=s.visitor AND v.env=s.env WHERE ${env.replaceAll('e.env','s.env')} AND ${visitor} AND s.started>=@start AND s.started<@end`).all(args) as {id:string;last_seen:number}[];
  const eligible=new Map(sessions.map(s=>[s.id,s.last_seen]));
  const events=db.prepare(`SELECT e.session,e.visitor,e.name,e.screen,e.at,e.game_id,e.room_id FROM events e INDEXED BY events_journeys JOIN visitors v ON v.id=e.visitor AND v.env=e.env WHERE ${eventWhere} AND e.at>=@start AND e.at<@end AND e.name IN ('screen_view','game_started','game_viewed','room_created','room_joined') ORDER BY e.at,e.received`).all(args) as Evidence[];
  const facts=db.prepare(`SELECT g.id,g.room_id,g.mode,g.started,g.finished FROM games g WHERE ${env.replaceAll('e.env','g.env')}${version.replaceAll('e.version','g.version')} AND g.humans>0 AND started>=@start AND started<@end`).all(args) as Fact[];
  const games=new Map(facts.map(g=>[g.id,g]));
  const turns=db.prepare(`SELECT t.game_id,t.visitor,t.at FROM turns t JOIN games g ON g.id=t.game_id JOIN visitors v ON v.id=t.visitor AND v.env=g.env WHERE ${env.replaceAll('e.env','g.env')} AND ${visitor} AND t.is_ai=0 AND t.retracted=0 AND t.at>=@start AND t.at<@end ORDER BY t.at`).all(args) as {game_id:string;visitor:string;at:number}[];
  const bySession=new Map<string,Evidence[]>(),byActor=new Map<string,number[]>();
  for(const e of events)if(eligible.has(e.session)){const list=bySession.get(e.session)||[];list.push(e);bySession.set(e.session,list);}
  for(const t of turns){const key=t.game_id+':'+t.visitor;const list=byActor.get(key)||[];list.push(t.at);byActor.set(key,list);}
  const definitions=[{key:'local',title:'Local Game Onboarding',labels:['Home session','Opened local setup','Game started','First human turn','Deep play']},{key:'online_create',title:'Create an Online Room',labels:['Opened online setup','Room created','Game started','First human turn']},{key:'online_join',title:'Join an Online Room',labels:['Opened online setup','Room joined','Game started','First human turn']}];
  return definitions.map(d=>{
    const times=d.labels.map(()=>[] as number[]);
    for(const list of bySession.values()){
      const local=d.key==='local';const initial=list.find(e=>e.name==='screen_view'&&e.screen===(local?'home':'online_setup'));if(!initial)continue;
      times[0].push(0);
      const second=list.find(e=>e.at>=initial.at&&(local?e.name==='screen_view'&&e.screen==='local_setup':e.name===(d.key==='online_create'?'room_created':'room_joined')&&(d.key!=='online_join'||!list.some(c=>c.name==='room_created'&&c.room_id===e.room_id))));if(!second)continue;
      times[1].push(second.at-initial.at);
      const entered=list.find(e=>e.at>=second.at&&['game_started','game_viewed'].includes(e.name)&&games.has(e.game_id)&&(local?games.get(e.game_id)!.mode.startsWith('local_'):games.get(e.game_id)!.room_id===second.room_id));if(!entered)continue;
      times[2].push(entered.at-second.at);
      const committed=(byActor.get(entered.game_id+':'+entered.visitor)||[]).filter(at=>at>=entered.at&&at<=Math.min(Number(args.end),eligible.get(entered.session)!));if(!committed.length)continue;
      times[3].push(committed[0]-entered.at);
      if(local){const g=games.get(entered.game_id)!;if(committed.length>=3)times[4].push(committed[2]-committed[0]);else if(g.finished!==null&&g.finished>=committed[0]&&g.finished<Number(args.end)&&g.finished<=eligible.get(entered.session)!)times[4].push(g.finished-committed[0]);}
    }
    return {key:d.key,title:d.title,steps:d.labels.map((name,i)=>{const sorted=times[i].sort((a,b)=>a-b);return {name,count:sorted.length,p50Ms:i&&sorted.length?sorted[Math.ceil(sorted.length*.5)-1]:null};})};
  });
}
