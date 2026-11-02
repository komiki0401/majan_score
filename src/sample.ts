import {calculate,defaultRules,emptyState,localDay,type State} from './domain';
import type {Room} from './cloud';
import {tournamentName} from './tournament-name';
export const SAMPLE_KEY='janroku-sample-v1';
export type SampleStore={version:1;selected:string;rooms:Room[]};
export function freshSample(now=new Date()):SampleStore{
 const players=['こはる','そうた','みどり','はる'].map((name,i)=>({id:'sample-player-'+i,name}));
 const previous=new Date(now);previous.setDate(previous.getDate()-1);
 const day=localDay(previous),date=previous.toISOString(),scores=[42000,28000,19000,11000];
 const game={id:'sample-game-0-0',table:'1',round:1,date,playedOn:day,rows:calculate(players.map((player,i)=>({playerId:player.id,score:scores[i]})),defaultRules),rules:structuredClone(defaultRules),inputMode:'score' as const,revisions:[]};
 const room:Room={id:'sample-room-0',state:{...structuredClone(emptyState),name:tournamentName(day),players,games:[game]},version:1,deleted_at:null,updated_at:date};
 return {version:1,selected:room.id,rooms:[room]};
}
export function loadSample():SampleStore{
 const raw=localStorage.getItem(SAMPLE_KEY);if(!raw)return freshSample();
 const message='サンプルの保存データを読み込めません。「サンプルデータをリセット」で体験データを作り直せます。';
 let data:SampleStore;try{data=JSON.parse(raw);}catch{throw Error(message);}
 if(data?.version!==1||!Array.isArray(data.rooms)||!data.rooms.length||!data.rooms.every((r:Room)=>typeof r.id==='string'&&r.state?.version===1&&Array.isArray(r.state.players)&&Array.isArray(r.state.games)&&r.state.rules)||!data.rooms.some((r:Room)=>r.id===data.selected))throw Error(message);
 // Repair only untouched legacy seed metadata. Never rewrite user scores or edited rooms.
 const now=Date.now();return {...data,rooms:data.rooms.map((room:Room)=>{
  const seed=/^sample-room-([01])$/.exec(room.id),day=room.state.games[0]?.playedOn;
  if(seed&&room.version===1&&room.updated_at===day+'T12:00:00.000Z'&&Date.parse(room.updated_at)>now&&room.state.games.length===(seed[1]==='0'?8:4)&&room.state.games.every(game=>game.id.startsWith('sample-game-'+seed[1]+'-')&&game.date===room.updated_at))return {...room,updated_at:new Date(now-(Number(seed[1])*20+1)*60000).toISOString()};
  return room;
 })};
}
export function saveSample(store:SampleStore){localStorage.setItem(SAMPLE_KEY,JSON.stringify(store));}
