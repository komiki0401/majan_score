import {calculate,defaultRules,emptyState,localDay,type State} from './domain';
import type {Room} from './cloud';
export const SAMPLE_KEY='janroku-sample-v1';
export type SampleStore={version:1;selected:string;rooms:Room[]};
export function freshSample():SampleStore{
 const players=['こはる','そうた','みどり','はる','あおい'].map((name,i)=>({id:'sample-player-'+i,name}));
 const today=localDay();
 const rooms=['週末のなかよし卓','月あかり麻雀会'].map((name,r)=>{
  const games=Array.from({length:r?4:8},(_,i)=>{
   const ids=Array.from({length:4},(_,seat)=>players[(seat+i)%players.length].id);
   const scores=[[42000,28000,19000,11000],[18000,36000,31000,15000],[25000,12000,47000,16000],[8000,27000,22000,43000]][i%4];
   return {id:`sample-game-${r}-${i}`,table:'1',round:i+1,date:today+'T12:00:00.000Z',playedOn:today,rows:calculate(ids.map((playerId,j)=>({playerId,score:scores[j]})),defaultRules),rules:structuredClone(defaultRules),inputMode:'score' as const,revisions:[]};
  });
  return {id:'sample-room-'+r,state:{...structuredClone(emptyState),name,players:structuredClone(players),games},version:1,deleted_at:null,updated_at:today+'T12:00:00.000Z'};
 });
 return {version:1,selected:rooms[0].id,rooms};
}
export function loadSample():SampleStore{
 const raw=localStorage.getItem(SAMPLE_KEY);if(!raw)return freshSample();
 const data=JSON.parse(raw);if(data?.version!==1||!Array.isArray(data.rooms)||!data.rooms.length||!data.rooms.every((r:Room)=>typeof r.id==='string'&&r.state?.version===1&&Array.isArray(r.state.players)&&Array.isArray(r.state.games)&&r.state.rules)||!data.rooms.some((r:Room)=>r.id===data.selected))throw Error('サンプルの保存データを読み込めません。「サンプルをリセット」で体験データを作り直せます。');return data;
}
export function saveSample(store:SampleStore){localStorage.setItem(SAMPLE_KEY,JSON.stringify(store));}
