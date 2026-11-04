import {tournamentName} from './tournament-name';
import {useEffect,useMemo,useRef,useState} from 'react';
import type {CloudChange,CloudConnection,Room} from './cloud';
import {freshSample,loadSample,saveSample,type SampleStore} from './sample';
import {emptyState,type State} from './domain';

/** Storage adapter for the existing UI. This client has no network implementation. */
export function useSampleCloud(onState:(state:State)=>void,enabled:boolean,ephemeral=false):CloudConnection{
 const [initial]=useState(()=>{if(!enabled||ephemeral)return {store:freshSample(),error:''};try{return {store:loadSample(),error:''};}catch(e){return {store:freshSample(),error:(e as Error).message};}});
 const [store,setStore]=useState(initial.store),[message,setMessage]=useState(initial.error);
 const current=useRef(store);current.current=store;
 const logs=useRef(new Map<string,{log:CloudChange;before:Room}>());
 const room=store.rooms.find(r=>r.id===store.selected)!;
 useEffect(()=>{if(enabled)onState(room.state);},[enabled,room,onState]);
 function commit(next:SampleStore){if(initial.error)throw Error(initial.error);if(!ephemeral)saveSample(next);current.current=next;setStore(next);}
 function appendRoom(state:State,id:string=crypto.randomUUID()):Room{const next:Room={id,state,version:1,updated_at:new Date().toISOString(),deleted_at:null};commit({...current.current,rooms:[...current.current.rooms,next]});return next;}
 function prepareSampleScore(day:string){
  const rooms=current.current.rooms,source=rooms.find(room=>room.id===current.current.selected)!;
  // Respect a tournament explicitly created/selected by the user.
  if(!source.deleted_at&&source.id!=='sample-room-0'&&!source.id.startsWith('sample-today-'))return {room:source,created:false};
  const prefix='sample-today-'+day+'-',existing=rooms.find(room=>!room.deleted_at&&room.id.startsWith(prefix));
  if(existing)return {room:existing,created:false};
  const players=source.state.players.length>=4?source.state.players:freshSample().rooms[0].state.players;
  const state={...structuredClone(emptyState),rules:structuredClone(source.state.rules),players:structuredClone(players),name:tournamentName(day,rooms.map(room=>room.state.name))};
  return {room:appendRoom(state,prefix+crypto.randomUUID()),created:true};
 }
 async function update(id:string,state:State,deleted_at?:string|null){const before=current.current.rooms.find(r=>r.id===id);if(!before)throw Error('NOT_FOUND');const date=new Date().toISOString(),next={...before,state,version:before.version+1,updated_at:date,deleted_at:deleted_at===undefined?before.deleted_at:deleted_at};const log:CloudChange={id:crypto.randomUUID(),room_id:id,version:next.version,kind:deleted_at!==undefined?'archive':'settings',entity_id:id,before_data:{deleted_at:before.deleted_at},after_data:{deleted_at:next.deleted_at},created_at:date,restored_from:null};commit({...current.current,rooms:current.current.rooms.map(r=>r.id===id?next:r)});logs.current.set(log.id,{log,before});return next;}
 const client=useMemo(()=>({rpc:async(name:string,args?:{target?:string;page_offset?:number;page_size?:number})=>{
  const rooms=current.current.rooms;
  if(name==='jr_group_index')return {data:rooms.slice(args?.page_offset??0,(args?.page_offset??0)+(args?.page_size??500)).map(r=>({room_id:r.id,version:r.version,updated_at:r.updated_at})),error:null};
  if(name==='jr_group_room')return {data:rooms.find(r=>r.id===args?.target)??null,error:null};
  throw Error('Sample adapter does not support network operations');
 }}) as unknown as NonNullable<CloudConnection['client']>,[]);
 const changes=[...logs.current.values()].filter(item=>item.log.room_id===room.id).map(item=>item.log).reverse();
 return {readOnly:false,shortId:null,authorizeGroup:async()=>{throw Error('Sample has no editor keys');},editorShareURL:()=>null,prepareSampleScore,localRooms:enabled?store.rooms:undefined,resetSample:()=>{const next=freshSample();if(!ephemeral)saveSample(next);current.current=next;setStore(next);logs.current.clear();setMessage('');},groupMode:true,groupName:'サンプルの雀録',groupError:'',groupAvailable:false,createGroup:async()=>{throw Error('トップページから本物のグループを作成してください。');},config:{url:'',key:''},client:enabled?client:null,roomId:room.id,room,rooms:store.rooms.map(r=>({id:r.id,name:r.state.name,players:r.state.players.length,games:r.state.games.length,version:r.version,updated_at:r.updated_at,deleted_at:r.deleted_at})),changes,status:ephemeral?'サンプル・リロードでリセット':'サンプル・ブラウザ内保存',message,setMessage,saving:false,loading:false,active:true,
  configure:()=>{throw Error('Sample cannot connect to Supabase');},selectRoom:id=>{if(id&&current.current.rooms.some(r=>r.id===id))commit({...current.current,selected:id});},
  saveRemote:async next=>{if(initial.error)throw Error(initial.error);await update(current.current.selected,next);},renameRoom:async(id,name)=>{const r=current.current.rooms.find(r=>r.id===id)!;await update(id,{...r.state,name:name.trim()});},
  createRoom:async(state:State,autoNameDay?:string)=>{if(autoNameDay)state={...state,name:tournamentName(autoNameDay,current.current.rooms.map(room=>room.state.name))};return appendRoom(state);},
  shareURL:()=>location.origin+location.pathname+'#sample',reloadRooms:async()=>store.rooms.map(r=>({id:r.id,name:r.state.name,players:r.state.players.length,games:r.state.games.length,version:r.version,updated_at:r.updated_at,deleted_at:r.deleted_at})),reloadChanges:async()=>changes,latest:()=>current.current.rooms.find(r=>r.id===current.current.selected)!,
  restore:async id=>{const item=logs.current.get(id);if(!item)throw Error('NOT_FOUND');return update(item.before.id,item.before.state,item.before.deleted_at);},archive:async item=>{const r=current.current.rooms.find(r=>r.id===item.id)!;return update(r.id,r.state,new Date().toISOString());},restoreRoom:async id=>{const r=current.current.rooms.find(r=>r.id===id)!;return update(id,r.state,null);}
 };
}
