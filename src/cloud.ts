import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createClient,type Session} from '@supabase/supabase-js';
import {type State} from './domain';
export type CloudConfig={url:string;key:string};
export type Room={id:string;owner_id:string;state:State;version:number;updated_at:string};
export function validConfig(config:CloudConfig):boolean{
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.url))return false;
 if(/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.key))return true;
 try{return JSON.parse(atob(config.key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='anon';}catch{return false;}
}
export function readConfig():CloudConfig|null{try{const c=JSON.parse(localStorage.getItem('janroku-cloud-config')??'null');return c&&validConfig(c)?c:null;}catch{return null;}}
export function readInvitation():{config:CloudConfig;code:string}|null{try{const p=new URLSearchParams(location.hash.slice(1));const config={url:p.get('project')??'',key:p.get('key')??''};const code=p.get('join')??'';return validConfig(config)&&/^[a-f0-9]{64}$/.test(code)?{config,code}:null;}catch{return null;}}
export function cloudMessage(error:unknown):string{
 const m=error instanceof Error?error.message:String((error as {message?:string})?.message??error);
 if(m.includes('VERSION_CONFLICT'))return 'ほかの端末で更新されました。最新の記録を読み直しました。入力内容を確認し、もう一度保存してください。';
 if(m.includes('OWNER_ONLY'))return '共有大会の入力・編集・削除と設定変更は主催者のみ可能です。';
 if(m.includes('INVALID_INVITE'))return '招待コードが無効です。主催者に最新のコードを確認してください。';
 if(m.includes('INVALID')||m.includes('LIMIT'))return '記録を保存できません。入力値・参加者・ルール、共有データの上限（2MB）を確認してください。';
 if(m.includes('Invalid login credentials'))return 'メールアドレスまたはパスワードを確認してください。';
 if(m.includes('Email not confirmed'))return '確認メールのリンクを開いてからログインしてください。';
 if(m.includes('42P01')||m.includes('PGRST202')||m.includes('schema cache'))return '共有DBの設定が未完了です。SupabaseのSQL Editorで setup.sql を実行してください。';
 return 'クラウドへ接続できませんでした。接続設定・ログイン状態・ネットワークを確認してください。変更はクラウドに保存されていません。';
}
export function useCloud(onState:(state:State)=>void){
 const [config,setConfig]=useState<CloudConfig|null>(readConfig);
 const client=useMemo(()=>config?createClient(config.url,config.key):null,[config]);
 const [session,setSession]=useState<Session|null>(null),[authReady,setAuthReady]=useState(false);
 const [roomId,setRoomId]=useState<string|null>(()=>{try{return localStorage.getItem('janroku-cloud-room');}catch{return null;}});
 const [room,setRoom]=useState<Room|null>(null),[rooms,setRooms]=useState<Room[]>([]),[status,setStatus]=useState('未接続'),[message,setMessage]=useState(''),[saving,setSaving]=useState(false);
 const targetRef=useRef(roomId);targetRef.current=roomId;
 const ref=useRef<Room|null>(null),busy=useRef(false),generation=useRef(0);
 const apply=useCallback((next:Room)=>{if(next.id!==targetRef.current)return;if(ref.current?.id===next.id&&ref.current.version>next.version)return;ref.current=next;setRoom(next);onState(next.state);},[onState]);
 const refresh=useCallback(async()=>{if(!client||!roomId)return;const target=roomId;const {data,error}=await client.from('jr_rooms').select('*').eq('id',target).single();if(error)throw error;return data as Room;},[client,roomId]);
 useEffect(()=>{setAuthReady(false);setSession(null);if(!client){setAuthReady(true);return;}let alive=true;client.auth.getSession().then(({data,error})=>{if(!alive)return;if(error)setMessage(cloudMessage(error));setSession(data.session);setAuthReady(true);});const {data}=client.auth.onAuthStateChange((_event,next)=>{if(alive){setSession(next);setAuthReady(true);}});return ()=>{alive=false;data.subscription.unsubscribe();};},[client]);
 useEffect(()=>{let alive=true;if(!client||!session){setRooms([]);return;}client.from('jr_rooms').select('*').order('updated_at',{ascending:false}).then(({data,error})=>{if(!alive)return;if(error)setMessage(cloudMessage(error));else setRooms((data??[]) as Room[]);});return()=>{alive=false;};},[client,session?.user.id,roomId]);
 useEffect(()=>{generation.current++;ref.current=null;setRoom(null);if(!roomId){setStatus('ローカル保存');return;}if(!client||!session){setStatus(authReady?'ログイン待ち':'接続準備中');return;}let alive=true;let realtimeReady=false;setStatus('接続中');
 const sync=async()=>{try{const data=await refresh();if(alive&&data){apply(data);setStatus(realtimeReady?'リアルタイム接続':'同期済み');}}catch(e){if(alive){setStatus('接続エラー');setMessage(cloudMessage(e));}}};
 void sync();const channel=client.channel(`jr-room-${roomId}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'jr_rooms',filter:`id=eq.${roomId}`},()=>{void sync();}).subscribe(state=>{if(!alive)return;if(state==='SUBSCRIBED'){realtimeReady=true;setStatus('リアルタイム接続');void sync();}else if(state==='CHANNEL_ERROR'||state==='TIMED_OUT'||state==='CLOSED'){realtimeReady=false;setStatus('再接続中（定期更新）');}});
 const timer=setInterval(()=>void sync(),15000);const visible=()=>{if(document.visibilityState==='visible')void sync();};window.addEventListener('online',visible);document.addEventListener('visibilitychange',visible);
 return()=>{alive=false;clearInterval(timer);window.removeEventListener('online',visible);document.removeEventListener('visibilitychange',visible);void client.removeChannel(channel);};
 },[client,roomId,session?.user.id,authReady,apply,refresh]);
 async function saveRemote(next:State,expectedVersion?:number){
  if(!client||!session||!ref.current||ref.current.id!==roomId)throw Error('NOT_CONNECTED');
  if(expectedVersion!==undefined&&expectedVersion!==ref.current.version){const latest=await refresh();if(latest)apply(latest);throw Error('VERSION_CONFLICT');}
  if(busy.current)throw Error('SAVING');busy.current=true;setSaving(true);const current=ref.current;const gen=generation.current;
  try{const {data,error}=await client.rpc('jr_save_room',{target:current.id,expected_version:current.version,next_state:next});if(error){if(error.message.includes('VERSION_CONFLICT')){const latest=await refresh();if(latest&&gen===generation.current)apply(latest);}throw error;}if(gen===generation.current)apply(data as Room);setStatus('同期済み');}
  finally{busy.current=false;setSaving(false);}
 }
 function selectRoom(id:string|null){if(busy.current)return;if(id)localStorage.setItem('janroku-cloud-room',id);else localStorage.removeItem('janroku-cloud-room');ref.current=null;setRoom(null);setRoomId(id);setMessage('');}
 function configure(next:CloudConfig){if(!validConfig(next))throw Error('公開用のProject URLとPublishable key（またはanon key）を入力してください。Secret key・service_roleは使用できません。');localStorage.setItem('janroku-cloud-config',JSON.stringify(next));selectRoom(null);setConfig(next);setMessage('接続設定を保存しました。ログインしてください。');}
 async function openRoom(data:Room){setRooms(old=>[data,...old.filter(r=>r.id!==data.id)]);selectRoom(data.id);}
 return {config,client,session,authReady,roomId,room,rooms,status,message,setMessage,saving,active:!!roomId,owner:!!room&&room.owner_id===session?.user.id,configure,selectRoom,openRoom,saveRemote,latest:()=>ref.current};
}
export type CloudConnection=ReturnType<typeof useCloud>;
