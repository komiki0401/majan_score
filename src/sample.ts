import {calculate,defaultRules,emptyState,localDay,type State} from './domain';
import type {Room} from './cloud';
export const SAMPLE_KEY='janroku-sample-v1';
export type SampleStore={version:1;selected:string;rooms:Room[]};
export function freshSample(now=new Date()):SampleStore{
 const players=['こはる','そうた','みどり','はる','あおい'].map((name,i)=>({id:'sample-player-'+i,name}));
 const today=localDay(now);
 const rooms=['週末のなかよし卓','月あかり麻雀会'].map((name,r)=>{
  const games=Array.from({length:r?4:8},(_,i)=>{
   const ids=Array.from({length:4},(_,seat)=>players[(seat+i)%players.length].id);
   const scores=[[42000,28000,19000,11000],[18000,36000,31000,15000],[25000,12000,47000,16000],[8000,27000,22000,43000]][i%4];
   const date=new Date(now.getTime()-(r*20+(r?4:8)-i)*60000).toISOString();
   return {id:`sample-game-${r}-${i}`,table:'1',round:i+1,date,playedOn:today,rows:calculate(ids.map((playerId,j)=>({playerId,score:scores[j]})),defaultRules),rules:structuredClone(defaultRules),inputMode:'score' as const,revisions:[]};
  });
  return {id:'sample-room-'+r,state:{...structuredClone(emptyState),name,players:structuredClone(players),games},version:1,deleted_at:null,updated_at:games.at(-1)!.date};
 });
 return {version:1,selected:rooms[0].id,rooms};
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
