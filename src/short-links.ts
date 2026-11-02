import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import type {CloudConfig} from './cloud';
const key=(project:string,id:string)=>'janroku-group-editor:'+project+':'+id;
export function storedEditor(project:string,id:string):string|null{try{const token=localStorage.getItem(key(project,id));return token&&/^[a-f0-9]{64}$/.test(token)?token:null;}catch{return null;}}
export function rememberEditor(project:string,id:string,token:string):boolean{if(!/^[A-Za-z0-9_-]{16}$/.test(id)||!/^[a-f0-9]{64}$/.test(token))return false;try{localStorage.setItem(key(project,id),token);return true;}catch{return false;}}
export function groupClient(config:CloudConfig,token:string,shortId?:string){return createClient(config.url,config.key,{global:{headers:{'x-janroku-group':token,...(shortId?{'x-janroku-view':shortId}:{})}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});}
export async function issueShortLink(config:CloudConfig,token:string,existing?:SupabaseClient):Promise<string|null>{
 const {data,error}=await (existing??groupClient(config,token)).rpc('jr_group_short_link');
 if(error){if(['PGRST202','42883','404'].includes(error.code??''))return null;throw Error('短縮URLを発行できませんでした。接続とSQL設定を確認してください。');}
 const id=data?.short_id;if(typeof id!=='string'||!/^[A-Za-z0-9_-]{16}$/.test(id))return null;
 rememberEditor(config.url,id,token);return id;
}
