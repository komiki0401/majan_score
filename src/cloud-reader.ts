import type {SupabaseClient} from '@supabase/supabase-js';
import type {Room,RoomSummary} from './cloud';
import {loadTournamentIndex} from './all-tournaments';
import {groupRPC} from './group-sharing';

// Each client carries its own group header. Never share cache across clients or persist it.
const readers=new WeakMap<SupabaseClient,ReturnType<typeof createReader>>();
export function cloudReader(client:SupabaseClient,group:boolean){let reader=readers.get(client);if(!reader){reader=createReader(client,group);readers.set(client,reader);}return reader;}
function createReader(client:SupabaseClient,group:boolean){
 let index:RoomSummary[]|undefined,expires=0,epoch=0,flight:Promise<RoomSummary[]>|undefined;
 const rooms=new Map<string,Room>(),requests=new Map<string,Promise<Room>>();
 function prime(room:Room){if((rooms.get(room.id)?.version??-1)<=room.version){rooms.delete(room.id);rooms.set(room.id,room);}while(rooms.size>200)rooms.delete(rooms.keys().next().value!);}
 return {
  invalidate(){expires=0;epoch++;},prime,
  index(){
   if(flight)return flight;
   if(index&&Date.now()<expires)return Promise.resolve(index);
   const started=epoch;
   flight=loadTournamentIndex(async(offset,size)=>{const {data,error}=group?await client.rpc('jr_group_index',{page_offset:offset,page_size:size}):await client.from('jr_public_events').select('room_id,version,updated_at').order('room_id',{ascending:true}).range(offset,offset+size-1);if(error)throw error;return data??[];}).then(next=>{if(!index||JSON.stringify(index)!==JSON.stringify(next))index=next;expires=started===epoch?Date.now()+12000:0;return index;}).finally(()=>{flight=undefined;});
   return flight;
  },
  room(id:string,version?:number,force=false):Promise<Room>{
   const cached=rooms.get(id);if(!force&&cached&&version!==undefined&&cached.version>=version)return Promise.resolve(cached);
   const pending=requests.get(id);if(pending)return pending;
   const request=(async()=>{const {data,error}=await client.rpc(groupRPC('jr_public_room',group),{target:id});if(error)throw error;if(!data||data.error)throw Error(data?.error??'NOT_FOUND');prime(data);return rooms.get(id)!;})().finally(()=>requests.delete(id));requests.set(id,request);return request;
  }
 };
}
