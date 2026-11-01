import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {allTournamentState,recentTournament,loadTournamentScores,type CachedTournament} from './all-tournaments';
import {cloudMessage,type CloudConnection,type Room} from './cloud';
import {cloudReader} from './cloud-reader';
import {visibleSync} from './visible-sync';
import {type State} from './domain';
export function useAllTournamentScores(cloud:CloudConnection,enabled:boolean){
 const [result,setResult]=useState<{project:unknown;state:State|null;count:number;recent:Room|null;rooms:Room[]}>({project:null,state:null,count:0,recent:null,rooms:[]});
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const cache=useMemo(()=>new Map<string,CachedTournament>(),[cloud.client]);
 const signature=useRef(''),resultProject=useRef<unknown>(null);
 const latest=useRef(cloud);latest.current=cloud;
 const current=(cloud.room?`${cloud.room.id}:${cloud.room.version}:${cloud.room.deleted_at??''}`:'')+JSON.stringify(cloud.rooms.map(room=>[room.id,room.version,room.deleted_at]));
 useEffect(()=>{
  if(!enabled||!cloud.client)return;
  let alive=true;const project=cloud.client;if(resultProject.current!==project){signature.current='';resultProject.current=project;setLoading(true);}
  const reader=cloudReader(project,!!cloud.groupMode);
  let lastIndex:unknown;
  const control=visibleSync(async fresh=>{try{
   if(fresh)reader.invalidate();
   const index=await reader.index();
   if(index===lastIndex){if(alive)setError('');return;}
   const rooms=await loadTournamentScores(index,id=>reader.room(id,index.find(row=>row.id===id)?.version),cache,latest.current.room);
   const next=JSON.stringify(rooms.map(room=>[room.id,room.version,room.deleted_at]));
   if(alive){if(signature.current!==next){signature.current=next;setResult({project,state:allTournamentState(rooms),count:rooms.filter(room=>!room.deleted_at).length,recent:recentTournament(rooms),rooms});}lastIndex=index;setError('');}
  }catch(e){if(alive)setError(cloudMessage(e));}finally{if(alive)setLoading(false);}});
  return ()=>{alive=false;control.stop();};
 },[enabled,cloud.client,cloud.groupMode,current,cache,retry]);
 return {rooms:result.project===cloud.client?result.rooms:[],recent:result.project===cloud.client?result.recent:null,state:result.project===cloud.client?result.state:null,count:result.project===cloud.client?result.count:0,loading,error,reload:useCallback(()=>{if(cloud.client)cloudReader(cloud.client,!!cloud.groupMode).invalidate();setRetry(x=>x+1);},[cloud.client,cloud.groupMode])};
}
