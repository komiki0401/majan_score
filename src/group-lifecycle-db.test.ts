import {beforeAll,afterAll,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import legacy from '../supabase/setup.sql?raw';
import groups from '../supabase/groups.sql?raw';
import service from '../supabase/service-management.sql?raw';
import lifecycle from '../supabase/group-lifecycle.sql?raw';
import {emptyState,defaultRules,calculate} from './domain';
const db=new PGlite(),a='a'.repeat(64),b='b'.repeat(64),device=crypto.randomUUID();
const admin='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',ordinary='33333333-3333-4333-8333-333333333333';
let groupA:string,groupB:string,alias:string,publicRoom:string,before:any,backup:any;
async function call(name:string,args:unknown[]=[]):Promise<any>{return (await db.query<any>(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;}
async function headers(value:Record<string,string>){await db.query("select set_config('request.headers',$1,false)",[JSON.stringify(value)]);}
async function identity(id=admin,aal='aal2'){await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,role:'authenticated',aal,user_metadata:{admin:true}})]);}
async function disabled(){await identity();await call('jr_admin_group_status',[groupA,'active','disabled']);}
const remove=(receipt=backup?.receipt,name='A',id=groupA,saved=true)=>call('jr_admin_group_delete',[groupA,receipt,name,id,saved]);
beforeAll(async()=>{
 await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid;$$;");
 await db.exec(legacy);await db.exec(groups);await db.exec(service);await db.exec('set role anon');
 groupA=(await call('jr_group_create',[crypto.randomUUID(),'A',a])).id;groupB=(await call('jr_group_create',[crypto.randomUUID(),'B',b])).id;
 await headers({'x-janroku-group':a});alias=(await call('jr_group_short_link')).short_id;
 const players=[0,1,2,3].map(i=>({id:String(i),name:'P'+i}));await call('jr_group_apply',[groupA,crypto.randomUUID(),device,{changes:players.map(p=>({kind:'player',id:p.id,before:null,after:p}))}]);
 const game={id:'game',table:'1',round:1,date:'2026-11-01T00:00:00Z',playedOn:'2026-11-01',rules:defaultRules,revisions:[],rows:calculate(players.map((p,i)=>({playerId:p.id,score:40000-i*10000})),defaultRules)};
 await call('jr_group_apply',[groupA,crypto.randomUUID(),device,{changes:[{kind:'game',id:'game',before:null,after:game}]}]);before=await call('jr_group_room',[groupA]);
 publicRoom=(await call('jr_public_create',[crypto.randomUUID(),device,emptyState])).id;
 await db.exec('reset role');await db.query('insert into auth.users values($1),($2),($3)',[admin,other,ordinary]);await db.query('insert into jr_group_private.admin_users(user_id) values($1),($2)',[admin,other]);await db.exec(lifecycle);
},20000);
afterAll(()=>db.close());
it('denies all management operations to anonymous, ordinary accounts and AAL1 administrators',async()=>{
 const operations:[string,unknown[]][]=[['jr_admin_group_preview',[groupA]],['jr_admin_group_status',[groupA,'active','disabled']],['jr_admin_group_export',[groupA]],['jr_admin_group_delete',[groupA,crypto.randomUUID(),'A',groupA,true]]];
 await db.exec('set role anon');for(const [name,args] of operations)await expect(call(name,args)).rejects.toThrow();
 for(const [user,aal] of [[ordinary,'aal2'],[admin,'aal1']]){await identity(user,aal);for(const [name,args] of operations)await expect(call(name,args)).rejects.toThrow('ADMIN_REQUIRED');}
 await identity();for(const table of ['admin_group_actions','admin_group_exports'])await expect(db.query('select * from jr_group_private.'+table)).rejects.toThrow();
});
it('disables all read/write routes for both link types, preserves data and isolates other groups and legacy rooms',async()=>{
 await disabled();for(const h of [{'x-janroku-group':a},{'x-janroku-view':alias}] as Record<string,string>[]){
  await db.exec('set role anon');await headers(h);for(const [name,args] of [['jr_group_info',[]],['jr_group_list',[true]],['jr_group_index',[]],['jr_group_room',[groupA]],['jr_group_changes',[groupA]],['jr_group_apply',[groupA,crypto.randomUUID(),device,{changes:[]}]],['jr_group_tournament_create',[crypto.randomUUID(),device,emptyState]],['jr_group_short_link',[]]] as [string,unknown[]][])await expect(call(name,args)).rejects.toThrow('GROUP_NOT_FOUND');
 }
 expect((await call('jr_group_create',[groupA,'A',a])).error).toBe('GROUP_NOT_FOUND');await headers({'x-janroku-group':b});expect((await call('jr_group_info')).id).toBe(groupB);expect((await call('jr_public_room',[publicRoom])).id).toBe(publicRoom);
 await identity();expect((await call('jr_admin_group_preview',[groupA])).counts.games).toBe(1);expect((await call('jr_admin_stats')).active_groups).toBe(0);
});
it('restores the exact old URLs and game state and rejects stale or invalid status changes',async()=>{
 await identity();await expect(call('jr_admin_group_status',[groupA,'active','disabled'])).rejects.toThrow('STATE_CHANGED');await expect(call('jr_admin_group_status',[groupA,'disabled','deleted'])).rejects.toThrow('INVALID_STATUS');await call('jr_admin_group_status',[groupA,'disabled','active']);
 await db.exec('set role anon');await headers({'x-janroku-group':a});expect(await call('jr_group_room',[groupA])).toEqual(before);expect((await call('jr_group_short_link')).short_id).toBe(alias);await headers({'x-janroku-view':alias});expect((await call('jr_group_room',[groupA])).state).toEqual(before.state);
 await identity();await expect(call('jr_admin_group_export',[groupA])).rejects.toThrow('DISABLE_FIRST');await disabled();
});
it('exports the complete target snapshot including archived rooms, history and scoped request/rate records',async()=>{
 await db.exec('reset role');const room=crypto.randomUUID();await db.query('insert into jr_group_private.rooms(id,group_id,state,deleted_at) values($1,$2,$3,now())',[room,groupA,emptyState]);await db.query("insert into jr_group_private.jr_public_rates values('unrelated-shared',now(),1),($1,now(),1)",['device:'+groupB+':'+device]);
 await identity();backup=await call('jr_admin_group_export',[groupA]);expect(backup.format).toBe('janroku-group-backup-v1');expect(backup.snapshot.group.id).toBe(groupA);expect(backup.snapshot.link.short_id).toBe(alias);expect(backup.snapshot.rooms).toHaveLength(2);expect(backup.snapshot.rooms.some((r:any)=>r.deleted_at)).toBe(true);expect(backup.counts.games).toBe(1);expect(backup.counts.requests).toBeGreaterThan(0);expect(backup.counts.changes).toBe(5);expect(backup.snapshot.rates.every((r:any)=>r.bucket.includes(groupA))).toBe(true);expect(JSON.stringify(backup.snapshot)).not.toContain(a);expect(backup.snapshot.rooms[0].state).toBeDefined();
});
it('requires matching group, actor, explicit confirmation and a current unexpired server-side export receipt',async()=>{
 await identity();await expect(remove(crypto.randomUUID())).rejects.toThrow('FRESH_BACKUP_REQUIRED');await expect(remove(undefined,'wrong')).rejects.toThrow('CONFIRMATION_REQUIRED');await expect(remove(undefined,'A',groupB)).rejects.toThrow('CONFIRMATION_REQUIRED');await expect(remove(undefined,'A',groupA,false)).rejects.toThrow('CONFIRMATION_REQUIRED');
 await identity(other);await expect(remove()).rejects.toThrow('FRESH_BACKUP_REQUIRED');await identity();await expect(call('jr_admin_group_delete',[groupB,backup.receipt,'B',groupB,true])).rejects.toThrow('DISABLE_FIRST');
 await db.exec('reset role');await db.query("update jr_group_private.admin_group_exports set expires_at=now()-interval '1 second' where id=$1",[backup.receipt]);await identity();await expect(remove()).rejects.toThrow('FRESH_BACKUP_REQUIRED');backup=await call('jr_admin_group_export',[groupA]);
 await db.exec('reset role');await db.query('update jr_group_private.rooms set version=version+1 where id=$1',[groupA]);await identity();await expect(remove()).rejects.toThrow('BACKUP_STALE');backup=await call('jr_admin_group_export',[groupA]);
});
it('invalidates receipts across restore/disable and rolls back the entire deletion if any related record blocks it',async()=>{
 await call('jr_admin_group_status',[groupA,'disabled','active']);await call('jr_admin_group_status',[groupA,'active','disabled']);await expect(remove()).rejects.toThrow('FRESH_BACKUP_REQUIRED');backup=await call('jr_admin_group_export',[groupA]);
 await db.exec('reset role');await db.exec('create table temporary_blocker(room_id uuid references jr_group_private.rooms(id))');await db.query('insert into temporary_blocker values($1)',[groupA]);await identity();await expect(remove()).rejects.toThrow();const again=await call('jr_admin_group_export',[groupA]);expect(again.snapshot).toEqual(backup.snapshot);backup=again;
 await db.exec('reset role');await db.exec('drop table temporary_blocker');await db.exec(lifecycle);await identity();expect((await call('jr_admin_group_preview',[groupA])).status).toBe('disabled');
});
it('deletes exactly the exported group atomically, retains minimal audit and never recreates a deleted URL',async()=>{
 const result=await remove();expect(result.deleted).toBe(true);expect(result.counts).toEqual(backup.counts);await expect(call('jr_admin_group_preview',[groupA])).rejects.toThrow('GROUP_NOT_FOUND');await expect(call('jr_admin_group_status',[groupA,'disabled','active'])).rejects.toThrow('GROUP_NOT_FOUND');
 await db.exec('reset role');for(const table of ['groups','rooms','group_links','admin_group_exports']){const column=table==='groups'?'id':'group_id';expect((await db.query(`select * from jr_group_private.${table} where ${column}=$1`,[groupA])).rows).toEqual([]);}
 for(const table of ['jr_public_changes','jr_public_events','jr_public_requests'])expect((await db.query(`select * from jr_group_private.${table} where room_id=$1`,[groupA])).rows).toEqual([]);
 const rates=(await db.query<any>('select bucket from jr_group_private.jr_public_rates')).rows.map(r=>r.bucket);expect(rates.some(v=>v.includes(groupA))).toBe(false);expect(rates).toContain('unrelated-shared');expect(rates).toContain('device:'+groupB+':'+device);
 const audit=(await db.query<any>("select * from jr_group_private.admin_group_actions where target_group=$1 and action='delete'",[groupA])).rows;expect(audit).toHaveLength(1);expect(audit[0].counts).toEqual(backup.counts);expect(JSON.stringify(audit)).not.toContain(a);expect(audit[0].retired_short_id).toBe(alias);
 await db.exec('set role anon');expect((await call('jr_group_create',[groupA,'A',a])).error).toBe('GROUP_NOT_FOUND');expect((await call('jr_group_create',[crypto.randomUUID(),'new',a])).error).toBe('GROUP_NOT_FOUND');await headers({'x-janroku-view':alias});await expect(call('jr_group_info')).rejects.toThrow('GROUP_NOT_FOUND');await headers({'x-janroku-group':a});await expect(call('jr_group_info')).rejects.toThrow('GROUP_NOT_FOUND');await headers({'x-janroku-group':b});expect((await call('jr_group_info')).id).toBe(groupB);expect((await call('jr_public_room',[publicRoom])).id).toBe(publicRoom);await identity();expect((await call('jr_admin_stats')).total_groups).toBe(2);expect((await call('jr_admin_stats')).total_games).toBe(0);
});
