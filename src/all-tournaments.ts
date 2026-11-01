import {defaultRules,emptyState,gameDay,type State} from './domain';
import {type Room,type RoomSummary} from './cloud';

/** View-only records: keep all tournament/game IDs distinct, combine people by name. */
export function allTournamentState(rooms:Pick<Room,'id'|'state'|'deleted_at'>[]):State{
 const players=new Map<string,{id:string;name:string}>();
 const games:State['games']=[];
 for(const room of [...rooms].sort((a,b)=>a.id.localeCompare(b.id))){
  if(room.deleted_at)continue;
  const ids=new Map<string,string>();
  for(const player of room.state.players){
   const name=player.name.trim(),id=`name:${name}`;
   ids.set(player.id,id);if(!players.has(id))players.set(id,{id,name});
  }
  for(const game of room.state.games){
   games.push({...game,id:`tournament:${room.id}:game:${game.id}`,rows:game.rows.map(row=>({...row,playerId:ids.get(row.playerId)??`unknown:${room.id}:${row.playerId}`})),revisions:[]});
  }
 }
 return {...emptyState,name:'全大会の成績',rules:defaultRules,players:[...players.values()].sort((a,b)=>a.name.localeCompare(b.name,'ja')),games};
}
export type CachedTournament={version:number;state:State;deleted_at?:string|null};
export type TournamentIndexEntry={room_id:string;version:number;updated_at:string};
/** The catalog is capped at 100 rows; use the RLS-protected event index in pages instead. */
export async function loadTournamentIndex(readPage:(offset:number,size:number)=>Promise<TournamentIndexEntry[]>):Promise<RoomSummary[]>{
 const result=new Map<string,RoomSummary>();const size=500;
 for(let offset=0;;offset+=size){const page=await readPage(offset,size);for(const row of page){if((result.get(row.room_id)?.version??-1)<=row.version)result.set(row.room_id,{id:row.room_id,version:row.version,updated_at:row.updated_at,name:'',players:0,games:0,deleted_at:null});}if(page.length<size)break;}
 return [...result.values()];
}
/** Version-cache and bounded concurrency avoid repeatedly downloading unchanged history. */
export async function loadTournamentScores(
 rooms:RoomSummary[],fetchRoom:(id:string)=>Promise<Room>,cache:Map<string,CachedTournament>,current:Room|null,
):Promise<Room[]>{
 const active=rooms.filter(room=>!room.deleted_at),result:Room[]=new Array(active.length);
 let next=0;
 async function worker(){while(next<active.length){const index=next++,summary=active[index];
  let data:Room;
  if(current?.id===summary.id&&current.version>=summary.version)data=current;
  else {const cached=cache.get(summary.id);data=cached&&cached.version>=summary.version?{id:summary.id,state:cached.state,version:cached.version,deleted_at:cached.deleted_at??null,updated_at:summary.updated_at}:await fetchRoom(summary.id);}
  if(data.version<summary.version)throw Error('STALE_TOURNAMENT');
  const compact={...data.state,games:data.state.games.map(game=>({...game,revisions:[]}))};
  cache.set(data.id,{version:data.version,state:data.deleted_at?emptyState:compact,deleted_at:data.deleted_at});
  result[index]={...data,state:compact};
 }}
 await Promise.all(Array.from({length:Math.min(4,active.length)},worker));
 const keep=new Set(active.map(room=>room.id));for(const id of cache.keys())if(!keep.has(id))cache.delete(id);
 return result;
}

/** Most recent played date, then update time; archives never count. */
export function recentTournament(rooms:Room[]):Room|null{
 const date=(room:Room)=>room.state.games.reduce((latest,game)=>gameDay(game)>latest?gameDay(game):latest,'');
 return rooms.filter(room=>!room.deleted_at).sort((a,b)=>date(b).localeCompare(date(a))||b.updated_at.localeCompare(a.updated_at)||a.id.localeCompare(b.id))[0]??null;
}
