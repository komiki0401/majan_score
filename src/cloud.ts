import {prepareGroupTournament} from './group-initial-tournament';
import {tournamentName} from './tournament-name';
import {loadTournamentScores} from './all-tournaments';
import {visibleSync} from './visible-sync';
import {cloudReader} from './cloud-reader';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {groupAccess,newGroupToken,groupShareURL,groupRPC} from './group-sharing';
import {createClient} from '@supabase/supabase-js';
import {type State,type Game,sharingState,localDay} from './domain';
import {stateChanges,stableJSON,type PublicOperation} from './public-data';
export type CloudConfig={url:string;key:string};
export type Room={id:string;state:State;version:number;updated_at:string;deleted_at:string|null};
export type RoomSummary={id:string;name:string;players:number;games:number;version:number;updated_at:string;deleted_at:string|null};
export type CloudChange={id:string;room_id:string;version:number;kind:'game'|'player'|'settings'|'archive';entity_id:string;before_data:unknown;after_data:unknown;created_at:string;restored_from:string|null};
export function validConfig(config:CloudConfig):boolean{
 if(!config||!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.url))return false;
 if(/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.key))return true;
 try{return JSON.parse(atob(config.key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='anon';}catch{return false;}
}
export function readConfig():CloudConfig|null{
 try{const p=new URLSearchParams(location.hash.slice(1));const linked={url:p.get('project')??'',key:p.get('key')??''};if(validConfig(linked))return linked;
 const built={url:import.meta.env.VITE_SUPABASE_URL??'',key:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY??''};if(validConfig(built))return built;
 const saved=JSON.parse(localStorage.getItem('janroku-cloud-config')??'null');return validConfig(saved)?saved:null;}catch{return null;}
}
function linkedRoom():string|null{try{const r=new URLSearchParams(location.hash.slice(1)).get('room');return r&&/^[0-9a-f-]{36}$/.test(r)?r:null;}catch{return null;}}
function deviceId():string{try{const v=localStorage.getItem('janroku-device-id');if(v&&/^[0-9a-f-]{36}$/.test(v))return v;const id=crypto.randomUUID();localStorage.setItem('janroku-device-id',id);return id;}catch{return crypto.randomUUID();}}
export function cloudMessage(error:unknown):string{
 const m=error instanceof Error?error.message:String((error as {message?:string})?.message??error);
 if(m.includes('VERSION_CONFLICT'))return '同じ記録が別の端末で変更されました。最新の記録を取得したので、入力内容を確認して再保存してください。';
 if(m.includes('DUPLICATE_ROUND'))return 'この日・卓・半荘番号はすでに登録されています。履歴を確認し、新しい半荘なら番号を変更してください。';
 if(m.includes('DUPLICATE_PLAYER'))return '同じ名前の参加者がすでに登録されています。参加者一覧を確認してください。';
 if(m.includes('RULES_CHANGED'))return 'ルールが変更されています。最新のルールで計算結果を確認し直してください。';
 if(m.includes('RATE_LIMIT'))return '短時間の書き込み上限に達しました。少し待ってから再度お試しください。日次上限の場合は翌日（UTC）に再開します。';
 if(m.includes('ARCHIVED'))return 'この大会は削除済みです。変更履歴から大会を復元できます。';
 if(m.includes('NOT_FOUND'))return '大会が見つからないか、まだ公開対象になっていません。';
 if(m.includes('INVALID')||m.includes('LIMIT')||m.includes('REQUEST_REUSED'))return '保存できません。点数・順位・参加者・ルール、またはデータ上限を確認してください。';
 if(m.includes('PGRST')||m.includes('schema cache'))return '公開共有用SQLが未適用です。SupabaseのSQL Editorで最新のsetup.sqlを実行してください。';
 if(m.includes('SAVING'))return '保存中です。完了までお待ちください。';
 return 'クラウドへの保存を確認できませんでした。接続を確認して同じ内容で再保存してください。再送による重複を防止します。';
}
function unwrap<T>(data:T&{error?:string}|null,error:{message:string}|null):T{if(error)throw Error(error.message);if(!data)throw Error('NOT_FOUND');if(data.error)throw Error(data.error);return data;}
export function useCloud(onState:(state:State)=>void,enabled=true,workspace=true){
 const [{mode:groupMode,token:groupToken}]=useState(groupAccess);
 const [groupAvailable,setGroupAvailable]=useState<boolean|null>(null),[groupName,setGroupName]=useState(''),[groupError,setGroupError]=useState('');
 const pendingTournament=useRef<{key:string;state:State}|null>(null);
 const pendingGroup=useRef<{id:string;token:string;name:string;initialName?:string;nameRequest?:string;ready?:boolean}|null>(null);
 const [config,setConfig]=useState<CloudConfig|null>(()=>enabled?readConfig():null);
 // No sign-in, anonymous Auth account, session persistence, or Auth network requests.
 const client=useMemo(()=>enabled&&config&&(!groupMode||groupToken)?createClient(config.url,config.key,{global:{headers:groupToken?{'x-janroku-group':groupToken}:{}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},realtime:{params:{eventsPerSecond:10}}}):null,[config,groupToken,groupMode,enabled]);
 const reader=useMemo(()=>client?cloudReader(client,groupMode):null,[client,groupMode]);
 const [roomId,setRoomId]=useState<string|null>(linkedRoom),[room,setRoom]=useState<Room|null>(null),[rooms,setRooms]=useState<RoomSummary[]>([]),[changes,setChanges]=useState<CloudChange[]>([]);
 const [status,setStatus]=useState('未接続'),[message,setMessage]=useState(''),[saving,setSaving]=useState(false),[loading,setLoading]=useState(false);
 const ref=useRef<Room|null>(null),target=useRef(roomId),busy=useRef(false),generation=useRef(0),device=useRef(enabled?deviceId():'');target.current=roomId;
 const apply=useCallback((data:Room)=>{if(data.id!==target.current||ref.current&&ref.current.id===data.id&&ref.current.version>=data.version)return;ref.current=data;setRoom(data);onState(data.state);},[onState]);
 const reloadRooms=useCallback(async()=>{if(!client)return;const {data,error}=await client.rpc(groupRPC('jr_public_list',groupMode),{include_archived:true});const list=unwrap<RoomSummary[]>(data,error);setRooms(list);if(groupMode&&!target.current){const first=list.find(room=>!room.deleted_at);if(first)setRoomId(first.id);}return list;},[client,groupMode]);
 const fetchRoom=useCallback(async(id:string)=>{if(!reader)throw Error('NOT_CONNECTED');return reader.room(id,undefined,true);},[reader]);
 const reloadChanges=useCallback(async(id=target.current)=>{if(!client||!id)return [];const {data,error}=groupMode?await client.rpc('jr_group_changes',{target:id}):await client.from('jr_public_changes').select('id,room_id,version,kind,entity_id,before_data,after_data,created_at,restored_from').eq('room_id',id).order('version',{ascending:false}).order('created_at',{ascending:false}).limit(100);if(error)throw error;const list=(data??[]) as CloudChange[];if(id===target.current)setChanges(list);return list;},[client]);
 useEffect(()=>{if(!workspace||!client||!reader){setRooms([]);setLoading(false);return;}let alive=true,last:unknown;setLoading(true);
 const control=visibleSync(async fresh=>{try{if(fresh)reader.invalidate();const index=await reader.index();if(index!==last){await reloadRooms();last=index;}}catch(e){if(alive)setMessage(cloudMessage(e));}finally{if(alive)setLoading(false);}});
 const channel=groupMode?null:client.channel('jr-public-catalog').on('postgres_changes',{event:'*',schema:'public',table:'jr_public_events'},()=>{reader.invalidate();void control.run();}).subscribe();
 return()=>{alive=false;control.stop();if(channel)void client.removeChannel(channel);};},[client,reader,reloadRooms,groupMode,workspace]);
 useEffect(()=>{generation.current++;ref.current=null;setRoom(null);setChanges([]);if(!workspace||!client||!reader||!roomId){setStatus(client?'大会を選択':'未接続');return;}let alive=true,realtime=false,historyVersion=-1;setStatus('接続中');
 const control=visibleSync(async fresh=>{try{if(fresh)reader.invalidate();const index=await reader.index();const version=index.find(row=>row.id===roomId)?.version;const data=await reader.room(roomId,version);if(alive){apply(data);setStatus(realtime?'リアルタイム接続':'同期済み');if(historyVersion!==data.version){await reloadChanges(roomId);historyVersion=data.version;}}}catch(e){if(alive){setStatus('接続エラー');setMessage(cloudMessage(e));}}});
 const channel=groupMode?null:client.channel('jr-public-'+roomId).on('postgres_changes',{event:'*',schema:'public',table:'jr_public_events',filter:'room_id=eq.'+roomId},()=>{reader.invalidate();void control.run();}).subscribe(s=>{if(!alive)return;if(s==='SUBSCRIBED'){realtime=true;reader.invalidate();void control.run();}else if(s==='CHANNEL_ERROR'||s==='TIMED_OUT'||s==='CLOSED'){realtime=false;setStatus('再接続中・定期取得');}});
 return()=>{alive=false;control.stop();if(channel)void client.removeChannel(channel);};
 },[client,reader,roomId,apply,reloadChanges,groupMode,workspace]);
 useEffect(()=>{let alive=true;if(!client){setGroupAvailable(false);if(groupMode)setGroupError('このグループのURLを確認してください。');return;}void client.rpc('jr_group_status',{}, {get:true}).then(({data,error})=>{if(alive)setGroupAvailable(!error&&data?.version===1);});if(groupMode)void client.rpc('jr_group_info',{}, {get:true}).then(({data,error})=>{if(!alive)return;if(error||!data?.name){setGroupError('グループを開けませんでした。共有されたURLと接続を確認してください。');return;}setGroupName(data.name);setGroupError('');});return()=>{alive=false;};},[client,groupMode]);
 function privateGroupURL(token:string,id?:string){const custom=config&&(config.url!==import.meta.env.VITE_SUPABASE_URL||config.key!==import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)?config:undefined;return groupShareURL(token,id,custom);}
 async function createGroup(name:string){
  if(!client||!groupAvailable)throw Error('グループを作成できません。接続を確認してからお試しください。');
  const trimmed=name.trim();if(!trimmed||trimmed.length>60)throw Error('グループ名は1〜60文字で入力してください。');
  const storageKey='jr-pending-group:'+config!.url;
  let pending=pendingGroup.current;
  if(!pending||pending.name!==trimmed){
   try{const saved=JSON.parse(sessionStorage.getItem(storageKey)??'null');if(saved?.name===trimmed&&typeof saved.token==='string'&&/^[a-f0-9]{64}$/.test(saved.token)&&typeof saved.id==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(saved.id))pending=saved;else pending=null;}catch{pending=null;}
   if(!pending)pending={id:crypto.randomUUID(),token:newGroupToken(),name:trimmed,initialName:tournamentName(localDay()),nameRequest:crypto.randomUUID()};
   pendingGroup.current=pending;
  }
  try{sessionStorage.setItem(storageKey,JSON.stringify(pending));}catch{/* Keep the retry identity in memory when storage is unavailable. */}
  const {data,error}=await client.rpc('jr_group_create',{request_id:pending.id,group_name:trimmed,access_token:pending.token});
  if(error||!data||data.error){
   const code=String(data?.error??error?.code??'');
   if(code==='RATE_LIMIT'||code==='429')throw Error('作成回数の上限に達しました。1分ほど待ってから、同じ名前で再試行してください。続く場合は当日の上限に達している可能性があります。');
   if(code==='PGRST202'||code==='42883')throw Error('グループ作成機能の準備を確認できませんでした。ページを再読み込みしてからお試しください。（GROUP_API_UNAVAILABLE）');
   if(code==='42501')throw Error('グループ作成の権限を確認できませんでした。管理者に確認してください。（GROUP_PERMISSION_DENIED）');
   if(code==='INVALID_GROUP')throw Error('グループ名を確認してください。1〜60文字で入力できます。');
   const diagnostic=/^[A-Z0-9_]{3,32}$/.test(code)?'（'+code+'）':'';
   throw Error('作成を確認できませんでした。接続を確認し、同じ名前で再試行してください。重複作成を防いで再確認します。'+diagnostic);
  }
  if(typeof data.room_id!=='string'||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(data.room_id))throw Error('作成結果を確認できませんでした。同じ名前で再試行してください。（INVALID_GROUP_RESPONSE）');
  if(pending.initialName&&pending.nameRequest&&!pending.ready){await prepareGroupTournament(config!,pending.token,data.room_id,trimmed,pending.initialName,pending.nameRequest);pending.ready=true;try{sessionStorage.setItem(storageKey,JSON.stringify(pending));}catch{}}
  const url=privateGroupURL(pending.token,data.room_id);
  // Retain the identity so reopening the form or retrying after navigation recovers the same group.
  pendingGroup.current=pending;
  return url;
 }
 async function requestId(scope:string,payload:unknown):Promise<string>{
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableJSON(payload)));const digest=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  try{const pending=JSON.parse(localStorage.getItem(groupMode?'jr-group-pending:'+groupToken:'jr-public-pending')??'null');if(pending?.scope===scope&&pending?.digest===digest)return pending.id;const id=crypto.randomUUID();localStorage.setItem(groupMode?'jr-group-pending:'+groupToken:'jr-public-pending',JSON.stringify({scope,digest,id}));return id;}catch{return crypto.randomUUID();}
 }
 async function mutate(id:string,operation:PublicOperation){
  if(!client)throw Error('NOT_CONNECTED');if(busy.current)throw Error('SAVING');busy.current=true;setSaving(true);const gen=generation.current;
  try{const req=await requestId(id,operation);const {data,error}=await client.rpc(groupRPC('jr_public_apply',groupMode),{target:id,request_id:req,device_id:device.current,operation});const next=unwrap<Room>(data,error);reader?.prime(next);reader?.invalidate();if(gen===generation.current)apply(next);try{localStorage.removeItem(groupMode?'jr-group-pending:'+groupToken:'jr-public-pending');}catch{};await Promise.allSettled([reloadRooms(),reloadChanges(id)]);return next;}
  catch(e){try{const latest=await fetchRoom(id);if(gen===generation.current)apply(latest);}catch{}throw e;}
  finally{busy.current=false;setSaving(false);}
 }
 async function saveRemote(next:State,base:State,original?:Game|null,targetGameId?:string){if(!roomId||!ref.current||ref.current.id!==roomId)throw Error('NOT_CONNECTED');const patch=stateChanges(base,next,original,targetGameId);if(!patch.length)return;await mutate(roomId,{changes:patch});}
 async function renameRoom(id:string,name:string){
  const trimmed=name.trim();if(!trimmed||trimmed.length>60)throw Error('大会名は1〜60文字で入力してください。');
  const current=await fetchRoom(id);if(current.deleted_at)throw Error('ARCHIVED');
  const changes=stateChanges(current.state,{...current.state,name:trimmed});
  if(changes.length)await mutate(id,{changes});
 }
 function selectRoom(id:string|null){if(busy.current)return;ref.current=null;setRoom(null);setRoomId(id);setMessage('');}
 function configure(next:CloudConfig){if(!validConfig(next))throw Error('Project URLと公開用Publishable keyを入力してください。Secret key・service_roleは使用できません。');localStorage.setItem('janroku-cloud-config',JSON.stringify(next));selectRoom(null);setConfig(next);setMessage('接続設定を保存しました。大会を選ぶか、新しく作成してください。');}
 async function createRoom(initial:State,autoNameDay?:string){if(!client||busy.current)throw Error('NOT_CONNECTED');busy.current=true;setSaving(true);try{if(autoNameDay&&reader){const key=stableJSON({project:config?.url,groupToken,initial:{...initial,name:''},autoNameDay});if(pendingTournament.current?.key===key)initial=pendingTournament.current.state;else{reader.invalidate();const index=await reader.index();const existing=await loadTournamentScores(index,id=>reader.room(id,index.find(row=>row.id===id)?.version),new Map(),null);initial={...initial,name:tournamentName(autoNameDay,existing.map(room=>room.state.name))};pendingTournament.current={key,state:initial};}}const normalized=sharingState(initial);const req=await requestId('create',normalized);const {data,error}=await client.rpc(groupRPC('jr_public_create',groupMode),{request_id:req,device_id:device.current,initial_state:normalized});const next=unwrap<Room>(data,error);reader?.prime(next);reader?.invalidate();await reloadRooms();try{localStorage.removeItem(groupMode?'jr-group-pending:'+groupToken:'jr-public-pending');}catch{}pendingTournament.current=null;return next;}finally{busy.current=false;setSaving(false);}}
 function shareURL(id?:string){if(groupMode)return groupToken?privateGroupURL(groupToken,id):location.origin+location.pathname; const url=new URL(location.origin+location.pathname);const p=new URLSearchParams();if(config){p.set('project',config.url);p.set('key',config.key);}if(id)p.set('room',id);url.hash=p.toString();return url.href;}
 return {groupMode,groupName,groupError,groupAvailable,createGroup,config,client,roomId,room,rooms,changes,status,message,setMessage,saving,loading,active:!!roomId,configure,selectRoom,saveRemote,renameRoom,createRoom,shareURL,reloadRooms,reloadChanges,latest:()=>ref.current,
  restore:async(changeId:string)=>{if(!roomId)throw Error('NOT_CONNECTED');return mutate(roomId,{restore:changeId});},
  archive:async(item:RoomSummary)=>mutate(item.id,{changes:[{kind:'archive',id:item.id,before:{deleted_at:item.deleted_at},after:{deleted_at:'archive'}}]}),
  restoreRoom:async(id:string)=>{const list=await reloadChanges(id);const log=list.find(c=>c.kind==='archive'&&(c.after_data as {deleted_at?:string})?.deleted_at);if(!log)throw Error('NOT_FOUND');return mutate(id,{restore:log.id});}
 };
}
export type CloudConnection=ReturnType<typeof useCloud>&{
 /** Browser-only adapter snapshot: aggregate locally without polling or remote caches. */
 localRooms?:Room[];
 resetSample?:()=>void;
 prepareSampleScore?:(day:string)=>{room:Room;created:boolean};
};
