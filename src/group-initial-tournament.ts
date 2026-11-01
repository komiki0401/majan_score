import {createClient} from '@supabase/supabase-js';
import type {CloudConfig,Room} from './cloud';
import {stateChanges} from './public-data';
/** Compatibility with the deployed API: initialize only an unshared, newly created room. */
export async function prepareGroupTournament(config:CloudConfig,token:string,id:string,groupName:string,name:string,requestId:string){
 const client=createClient(config.url,config.key,{global:{headers:{'x-janroku-group':token}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const {data,error}=await client.rpc('jr_group_room',{target:id});
 if(error||!data?.state)throw Error('大会名の準備を確認できませんでした。同じグループ名で再試行してください。');
 const room=data as Room;
 // Never overwrite a room edited after creation, including an earlier successful retry.
 if(room.version!==1||room.deleted_at||room.state.games.length||room.state.players.length||room.state.name!==groupName)return;
 const saved=await client.rpc('jr_group_apply',{target:id,request_id:requestId,device_id:requestId,operation:{changes:stateChanges(room.state,{...room.state,name})}});
 if(saved.error||!saved.data?.state||saved.data.error)throw Error('大会名の準備を確認できませんでした。同じグループ名で再試行してください。');
}
