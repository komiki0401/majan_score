import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {allTournamentState,recentTournament,loadTournamentIndex,loadTournamentScores,type CachedTournament} from './all-tournaments';
import {cloudMessage,type CloudConnection,type Room} from './cloud';
import {type State} from './domain';
export function useAllTournamentScores(cloud:CloudConnection,enabled:boolean){
 const [result,setResult]=useState<{project:unknown;state:State|null;count:number;recent:Room|null;rooms:Room[]}>({project:null,state:null,count:0,recent:null,rooms:[]});
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const cache=useMemo(()=>new Map<string,CachedTournament>(),[cloud.client]);
 const latest=useRef(cloud);latest.current=cloud;
 const current=cloud.room?`${cloud.room.id}:${cloud.room.version}:${cloud.room.deleted_at??''}`:'';
 useEffect(()=>{
  if(!enabled||!cloud.client)return;
  let alive=true;const project=cloud.client;setLoading(true);setError('');
  const snapshot=latest.current;
  void loadTournamentIndex(async(offset,size)=>{
   const {data,error}=await project.from('jr_public_events').select('room_id,version,updated_at').order('room_id',{ascending:true}).range(offset,offset+size-1);if(error)throw error;return data??[];
  }).then(index=>loadTournamentScores(index,async id=>{
   const {data,error}=await project.rpc('jr_public_room',{target:id});if(error)throw error;if(!data||data.error)throw Error(data?.error??'NOT_FOUND');return data;
  },cache,snapshot.room)).then(rooms=>{if(alive)setResult({project,state:allTournamentState(rooms),count:rooms.filter(room=>!room.deleted_at).length,recent:recentTournament(rooms),rooms});}).catch(e=>{if(alive)setError(cloudMessage(e));}).finally(()=>{if(alive)setLoading(false);});
  return ()=>{alive=false;};
 },[enabled,cloud.client,current,cache,retry]);
 useEffect(()=>{
  if(!enabled||!cloud.client)return;const project=cloud.client;
  const reload=()=>setRetry(x=>x+1);
  const channel=project.channel('jr-global-ranking').on('postgres_changes',{event:'*',schema:'public',table:'jr_public_events'},reload).subscribe();
  const timer=setInterval(reload,15000),visible=()=>{if(document.visibilityState==='visible')reload();};
  document.addEventListener('visibilitychange',visible);window.addEventListener('online',visible);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('online',visible);void project.removeChannel(channel);};
 },[enabled,cloud.client]);
 return {rooms:result.project===cloud.client?result.rooms:[],recent:result.project===cloud.client?result.recent:null,state:result.project===cloud.client?result.state:null,count:result.project===cloud.client?result.count:0,loading,error,reload:useCallback(()=>setRetry(x=>x+1),[])};
}
