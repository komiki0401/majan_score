// GET-only payload sampling. Outputs counts/bytes, never credentials or participant data.
import {loadEnv} from 'vite';
const env=loadEnv('production',process.cwd(),'VITE_');
const url=process.env.VITE_SUPABASE_URL??env.VITE_SUPABASE_URL;
const key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY??env.VITE_SUPABASE_PUBLISHABLE_KEY;
if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url??'')||!/^sb_publishable_/.test(key??''))throw Error('Public connection configuration unavailable (values withheld).');
async function get(path){
 let response;try{response=await fetch(url.replace(/\/$/,'')+'/rest/v1/'+path,{headers:{apikey:key},redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw Error('Read failed (connection details withheld).');}
 if(!response.ok)throw Error('Read failed: HTTP '+response.status);
 const text=await response.text();return {bytes:Buffer.byteLength(text),data:JSON.parse(text)};
}
const catalog=await get('rpc/jr_public_list?include_archived=true');
const index=await get('jr_public_events?select=room_id,version,updated_at&order=room_id.asc&limit=500');
const rooms=[];
for(const row of catalog.data){
 const room=await get('rpc/jr_public_room?target='+encodeURIComponent(row.id));
 const history=await get('jr_public_changes?select=id,room_id,version,kind,entity_id,before_data,after_data,created_at,restored_from&room_id=eq.'+encodeURIComponent(row.id)+'&order=version.desc,created_at.desc&limit=100');
 rooms.push({roomBytes:room.bytes,historyBytes:history.bytes,players:room.data.state.players.length,games:room.data.state.games.length});
}
const mean=field=>rooms.length?Math.round(rooms.reduce((sum,row)=>sum+row[field],0)/rooms.length):0;
const before=catalog.bytes+index.bytes+mean('roomBytes')+mean('historyBytes');
console.log(JSON.stringify({sample:'legacy public data only; no writes; decoded JSON bytes, not billed transfer',tournaments:rooms.length,players:rooms.reduce((sum,row)=>sum+row.players,0),games:rooms.reduce((sum,row)=>sum+row.games,0),catalogBytes:catalog.bytes,indexBytes:index.bytes,meanRoomBytes:mean('roomBytes'),meanHistoryBytes:mean('historyBytes'),unchangedHourlyBeforeBytes:before*240,unchangedHourlyAfterBytes:index.bytes*240},null,2));
