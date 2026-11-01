import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {join,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadEnv} from 'vite';

const fail=message=>{throw new Error(message);};
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
export function hasSecret(text){
 if(/sb_secret_[A-Za-z0-9_-]{10,}|-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/.test(text))return true;
 return [...text.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)].some(([token])=>{try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url')).role==='service_role';}catch{return false;}});
}
function inspect(path){
 const data=readFileSync(path);if(!data.includes(0)&&hasSecret(data.toString('utf8')))fail('Secret-key pattern detected in a source/build file (contents withheld).');
}
function scanBuild(dir){for(const item of readdirSync(dir,{withFileTypes:true})){const path=join(dir,item.name);if(item.isSymbolicLink())fail('Unexpected symbolic link in build.');if(item.isDirectory())scanBuild(path);else inspect(path);}}
async function main(){
 const tracked=git('ls-files','-z').split('\0').filter(Boolean);
 const files=git('ls-files','--cached','--others','--exclude-standard','-z').split('\0').filter(Boolean);
 for(const path of files){const name=basename(path);if((name.startsWith('.env')&&name!=='.env.example')||/\.(pem|key|p12|pfx)$/i.test(name)||/^id_(rsa|ed25519|ecdsa)$/.test(name))fail('Environment/private-key file found in release sources.');inspect(path);}
 if(tracked.some(path=>basename(path).startsWith('.env')&&basename(path)!=='.env.example'))fail('Real environment file is tracked.');
 scanBuild('dist');
 const env=loadEnv('production',process.cwd(),'VITE_');
 const url=process.env.VITE_SUPABASE_URL??env.VITE_SUPABASE_URL;
 const key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY??env.VITE_SUPABASE_PUBLISHABLE_KEY;
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url??'')||!/^(sb_publishable_)[A-Za-z0-9_-]+$/.test(key??'')||/your-project|your_public_key/.test((url??'')+(key??'')))fail('Valid existing Supabase URL and Publishable Key are required (values withheld).');
 const root=url.replace(/\/$/,'')+'/rest/v1/';
 async function get(path){try{return await fetch(root+path,{headers:{apikey:key},signal:AbortSignal.timeout(15000),redirect:'error'});}catch{fail('Supabase read-only request failed (connection details withheld).');}}
 for(const table of ['jr_rooms','jr_public_requests','jr_public_rates','jr_audit','jr_members','jr_invites']){
  const response=await get(table+'?select=*&limit=1');
  if(![401,403].includes(response.status))fail('Anonymous direct read is not explicitly denied for '+table+' (HTTP '+response.status+').');
 }
 const response=await get('rpc/jr_public_list?include_archived=true');
 if(!response.ok)fail('Public tournament list unavailable.');
 const rooms=await response.json();if(!Array.isArray(rooms))fail('Invalid public tournament list.');
 for(const room of rooms){
  if(!/^[a-f0-9-]{36}$/i.test(room.id))fail('Invalid public tournament identifier.');
  const response=await get('rpc/jr_public_room?target='+encodeURIComponent(room.id));
  if(!response.ok)fail('Public tournament read failed.');
  const detail=await response.json();
  if(!detail.state||'owner_id' in detail)fail('Public tournament response violates the release contract.');
 }
 for(const table of ['jr_public_events','jr_public_changes']){
  const response=await get(table+'?select=room_id&limit=20');if(!response.ok)fail('Public event/history access unavailable.');
  const rows=await response.json();if(!Array.isArray(rows))fail('Invalid event/history response.');
  for(const id of new Set(rows.map(row=>row.room_id))){const response=await get('rpc/jr_public_room?target='+encodeURIComponent(id));if(!response.ok)fail('Event/history references inaccessible tournament.');const room=await response.json();if(!room.state)fail('Event/history exposes inaccessible tournament.');}
 }
 console.log('Release check passed: source/build key scan and GET-only anonymous Supabase access checks ('+rooms.length+' public tournaments).');
 console.log('RLS/ACL definitions are verified separately by in-memory database tests; production catalogs are not inspected.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){main().catch(error=>{console.error(error instanceof Error?error.message:'Release check failed.');process.exitCode=1;});}
