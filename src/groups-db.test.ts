import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import legacySchema from '../supabase/setup.sql?raw';
import groupSchema from '../supabase/groups.sql?raw';
import {emptyState,calculate,defaultRules} from './domain';
const db=new PGlite();
const tokenA='a'.repeat(64),tokenB='b'.repeat(64),unknown='c'.repeat(64),device=crypto.randomUUID();
let a:string,b:string,legacy:string;
async function call(name:string,args:unknown[]=[]):Promise<any>{return (await db.query<any>(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;}
async function scope(token?:string){await db.query("select set_config('request.headers',$1,false)",[JSON.stringify(token?{'x-janroku-group':token}:{})]);}
beforeAll(async()=>{
 await db.exec('create role anon;create role authenticated;');await db.exec(legacySchema);
 await db.exec('set role anon');legacy=(await call('jr_public_create',[crypto.randomUUID(),device,{...structuredClone(emptyState),name:'既存大会'}])).id;
 await db.exec('reset role');await db.exec(groupSchema);await db.exec(groupSchema);await db.exec('set role anon');
 await scope();await expect(call('jr_group_info')).rejects.toThrow('GROUP_NOT_FOUND');await expect(call('jr_group_list',[true])).rejects.toThrow('GROUP_NOT_FOUND');
 a=(await call('jr_group_create',[crypto.randomUUID(),'グループA',tokenA])).id;b=(await call('jr_group_create',[crypto.randomUUID(),'グループB',tokenB])).id;
},30000);
afterAll(async()=>db.close());
describe('isolated capability groups',()=>{
 it('keeps existing public data and APIs unchanged and never lists private groups there',async()=>{await scope();expect((await call('jr_public_list',[true])).map((r:any)=>r.id)).toEqual([legacy]);expect((await call('jr_public_room',[legacy])).state.name).toBe('既存大会');expect(await call('jr_public_room',[a])).toEqual({error:'NOT_FOUND'});});
 it('requires a valid capability for every group read route and isolates both groups',async()=>{
  for(const token of [undefined,unknown,'invalid']){await scope(token);for(const [name,args] of [['jr_group_info',[]],['jr_group_list',[true]],['jr_group_room',[a]],['jr_group_index',[0,500]],['jr_group_changes',[a]]] as const){await expect(call(name,[...args])).rejects.toThrow('GROUP_NOT_FOUND');}}
  await scope(tokenA);expect((await call('jr_group_info')).name).toBe('グループA');expect((await call('jr_group_list',[true])).map((r:any)=>r.id)).toEqual([a]);expect(await call('jr_group_room',[b])).toEqual({error:'NOT_FOUND'});expect(await call('jr_group_changes',[b])).toEqual([]);expect((await call('jr_group_index',[0,500])).map((r:any)=>r.room_id)).toEqual([a]);
  await scope(tokenB);expect((await call('jr_group_list',[true])).map((r:any)=>r.id)).toEqual([b]);expect(await call('jr_group_room',[legacy])).toEqual({error:'NOT_FOUND'});
 });
 it('rejects cross-group edits and replay requests, and retains data/history only within the group',async()=>{
  await scope(tokenA);const room=await call('jr_group_room',[a]);const before={name:room.state.name,rules:room.state.rules},after={...before,name:'Aの大会'};const req=crypto.randomUUID(),operation={changes:[{kind:'settings',id:'settings',before,after}]};
  const saved=await call('jr_group_apply',[a,req,device,operation]);expect(saved.state.name).toBe('Aの大会');expect(saved.state.players).toEqual([]);expect((await call('jr_group_changes',[a]))).toHaveLength(1);
  await scope(tokenB);expect(await call('jr_group_apply',[a,req,device,operation])).toEqual({error:'NOT_FOUND'});expect(await call('jr_group_changes',[a])).toEqual([]);expect((await call('jr_group_room',[b])).state.name).toBe('グループB');
  await scope(tokenA);expect((await call('jr_group_apply',[a,req,device,operation])).version).toBe(saved.version);
 });
 it('creates tournaments inside the authorized group and never leaks tokens or device identifiers',async()=>{
  await scope(tokenB);const room=await call('jr_group_tournament_create',[crypto.randomUUID(),device,{...structuredClone(emptyState),name:'Bの第2大会'}]);expect(room.state.name).toBe('Bの第2大会');expect((await call('jr_group_list',[true]))).toHaveLength(2);
  await scope(tokenA);expect(await call('jr_group_room',[room.id])).toEqual({error:'NOT_FOUND'});const changes=await call('jr_group_changes',[a]);expect(changes[0]).not.toHaveProperty('device_id');expect(changes[0]).not.toHaveProperty('request_id');expect(JSON.stringify(await call('jr_group_info'))).not.toContain(tokenA);
 });
 it('keeps private storage inaccessible and RLS enabled for every group table',async()=>{
  for(const table of ['groups','rooms','jr_rooms','jr_public_events','jr_public_changes','jr_public_rates','jr_public_requests'])await expect(db.query('select * from jr_group_private.'+table)).rejects.toThrow();
  await db.exec('reset role');const rows=await db.query<{relrowsecurity:boolean}>("select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='jr_group_private' and c.relkind='r'");expect(rows.rows.length).toBe(6);expect(rows.rows.every(r=>r.relrowsecurity)).toBe(true);
  const group=await db.query<{token_hash:string}>('select token_hash from jr_group_private.groups where id=$1',[a]);expect(group.rows[0].token_hash).not.toBe(tokenA);expect(group.rows[0].token_hash).toHaveLength(64);await db.exec('set role anon');
 });
 it('stores scores and reversible edits within a group for both anonymous and authenticated roles',async()=>{
  await scope(tokenA);
  const players=[0,1,2,3].map(i=>({id:String(i),name:'参加者'+i}));
  const created=await call('jr_group_apply',[a,crypto.randomUUID(),device,{changes:players.map(p=>({kind:'player',id:p.id,before:null,after:p}))}]);expect(created.state.players).toEqual(players);
  const game={id:'first-game',date:'2026-11-01T01:00:00Z',playedOn:'2026-11-01',table:'1',round:1,rules:defaultRules,revisions:[],rows:calculate([40000,30000,20000,10000].map((score,i)=>({playerId:String(i),score})),defaultRules)};
  const saved=await call('jr_group_apply',[a,crypto.randomUUID(),device,{changes:[{kind:'game',id:game.id,before:null,after:game}]}]);expect(saved.state.games).toHaveLength(1);
  await db.exec('set role authenticated');await scope(tokenB);expect(await call('jr_group_room',[a])).toEqual({error:'NOT_FOUND'});expect((await call('jr_group_room',[b])).state.players).toEqual([]);await expect(db.query('select * from jr_group_private.rooms')).rejects.toThrow();
  await scope(tokenA);const deleted=await call('jr_group_apply',[a,crypto.randomUUID(),device,{changes:[{kind:'game',id:game.id,before:saved.state.games[0],after:null}]}]);expect(deleted.state.games).toEqual([]);
  const changes=await call('jr_group_changes',[a]),deletion=changes.find((c:any)=>c.kind==='game'&&c.after_data===null);expect(deletion).toBeTruthy();const restored=await call('jr_group_apply',[a,crypto.randomUUID(),device,{restore:deletion.id}]);expect(restored.state.games).toEqual(saved.state.games);await db.exec('set role anon');
 });
 it('can be reapplied without changing either existing group records or legacy records',async()=>{await scope(tokenA);const before=await call('jr_group_room',[a]);const old=await call('jr_public_room',[legacy]);await db.exec('reset role');await db.exec(groupSchema);await db.exec('set role anon');expect(await call('jr_group_room',[a])).toEqual(before);expect(await call('jr_public_room',[legacy])).toEqual(old);});
});
