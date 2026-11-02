import {beforeAll,afterAll,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import legacy from '../supabase/setup.sql?raw';
import groups from '../supabase/groups.sql?raw';
import service from '../supabase/service-management.sql?raw';
import {emptyState,calculate,defaultRules} from './domain';
const db=new PGlite(),a='a'.repeat(64),b='b'.repeat(64),device=crypto.randomUUID();let groupA:string,groupB:string,linkA:string,linkB:string;
async function call(name:string,args:unknown[]=[]):Promise<any>{return (await db.query<any>(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;}
async function headers(value:Record<string,string>){await db.query("select set_config('request.headers',$1,false)",[JSON.stringify(value)]);}
beforeAll(async()=>{
 await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid;$$;");await db.exec(legacy);await db.exec(groups);
 await db.exec('set role anon');groupA=(await call('jr_group_create',[crypto.randomUUID(),'A',a])).id;groupB=(await call('jr_group_create',[crypto.randomUUID(),'B',b])).id;
 await db.exec('reset role');await db.exec(service);await db.exec('set role anon');
 await headers({'x-janroku-group':a});linkA=(await call('jr_group_short_link')).short_id;await headers({'x-janroku-group':b});linkB=(await call('jr_group_short_link')).short_id;
},20000);
afterAll(()=>db.close());
const admin='11111111-1111-4111-8111-111111111111',ordinary='22222222-2222-4222-8222-222222222222';
async function identity(id:string,aal='aal2',metadata:Record<string,unknown>={}){await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,role:'authenticated',aal,user_metadata:metadata})]);}
it('issues stable 16-character aliases for existing groups without exposing their edit token',async()=>{
 expect(linkA).toMatch(/^[A-Za-z0-9_-]{16}$/);expect(linkA).not.toBe(linkB);await headers({'x-janroku-group':a});expect((await call('jr_group_short_link')).short_id).toBe(linkA);expect(JSON.stringify(await call('jr_group_info'))).not.toContain(a);
});
it('allows scoped anonymous reads but rejects every existing write entry point with a short ID only',async()=>{
 await headers({'x-janroku-view':linkA});expect((await call('jr_group_info')).id).toBe(groupA);expect((await call('jr_group_room',[groupA])).state.name).toBe('A');expect(await call('jr_group_room',[groupB])).toEqual({error:'NOT_FOUND'});
 await expect(call('jr_group_apply',[groupA,crypto.randomUUID(),device,{changes:[]}])).rejects.toThrow('READ_ONLY');await expect(call('jr_group_tournament_create',[crypto.randomUUID(),device,emptyState])).rejects.toThrow('READ_ONLY');await expect(call('jr_group_short_link')).rejects.toThrow('READ_ONLY');
});
it('preserves legacy editing and denies mismatched short IDs and capabilities',async()=>{
 await headers({'x-janroku-group':a,'x-janroku-view':linkB});await expect(call('jr_group_info')).rejects.toThrow('GROUP_NOT_FOUND');
 await headers({'x-janroku-group':a});const room=await call('jr_group_room',[groupA]);const next=await call('jr_group_apply',[groupA,crypto.randomUUID(),device,{changes:[{kind:'settings',id:'settings',before:{name:room.state.name,rules:room.state.rules},after:{name:'A renamed',rules:room.state.rules}}]}]);expect(next.state.name).toBe('A renamed');
});
it('keeps aliases private, denies unknown links and can be reapplied without changing games or edit tokens',async()=>{
 await headers({'x-janroku-view':'0000000000000000'});await expect(call('jr_group_info')).rejects.toThrow('GROUP_NOT_FOUND');await expect(db.query('select * from jr_group_private.group_links')).rejects.toThrow();
 await headers({'x-janroku-group':a});const before=await call('jr_group_room',[groupA]);await db.exec('reset role');await db.exec(service);await db.exec('set role anon');expect(await call('jr_group_room',[groupA])).toEqual(before);expect((await call('jr_group_short_link')).short_id).toBe(linkA);
});
it('checks admin identity and MFA in the database, not user-editable metadata or a group token',async()=>{
 await db.exec('reset role');await db.query('insert into auth.users(id) values($1),($2) on conflict do nothing',[admin,ordinary]);await db.query('insert into jr_group_private.admin_users(user_id) values($1) on conflict do nothing',[admin]);await db.exec('set role anon');await headers({'x-janroku-group':a});await expect(call('jr_admin_stats')).rejects.toThrow();
 await db.exec('set role authenticated');await identity(ordinary,'aal2',{admin:true,role:'admin'});await expect(call('jr_admin_stats')).rejects.toThrow('ADMIN_REQUIRED');await expect(call('jr_admin_groups')).rejects.toThrow('ADMIN_REQUIRED');
 await identity(admin,'aal1');await expect(call('jr_admin_stats')).rejects.toThrow('ADMIN_REQUIRED');await identity(admin);const stats=await call('jr_admin_stats');expect(stats.total_groups).toBe(2);expect(stats.total_games).toBe(0);
 const list=await call('jr_admin_groups',[0,1,'',false]);expect(list.total).toBe(2);expect(list.groups).toHaveLength(1);expect(JSON.stringify(list)).not.toContain('token_hash');expect(JSON.stringify(list)).not.toContain(a);expect(list.groups[0].short_id).toHaveLength(16);
 for(const table of ['admin_users','group_links','group_management'])await expect(db.query('select * from jr_group_private.'+table)).rejects.toThrow();
});
it('tracks game activity separately from group and player name edits and uses the existing score engine',async()=>{
 await db.exec('set role anon');await headers({'x-janroku-group':a});const players=[0,1,2,3].map(i=>({id:String(i),name:'P'+i}));
 await call('jr_group_apply',[groupA,crypto.randomUUID(),device,{changes:players.map(player=>({kind:'player',id:player.id,before:null,after:player}))}]);
 await db.exec('set role authenticated');await identity(admin);let item=(await call('jr_admin_groups',[0,100,'A',false])).groups[0];expect(item.player_count).toBe(4);expect(item.last_game_update_at).toBeNull();
 await db.exec('set role anon');const game={id:'service-game',table:'1',round:1,date:'2026-11-01T00:00:00Z',playedOn:'2026-11-01',rules:defaultRules,revisions:[],rows:calculate([40000,30000,20000,10000].map((score,i)=>({playerId:String(i),score})),defaultRules)};
 await call('jr_group_apply',[groupA,crypto.randomUUID(),device,{changes:[{kind:'game',id:game.id,before:null,after:game}]}]);await db.exec('set role authenticated');item=(await call('jr_admin_groups',[0,100,'A',false])).groups[0];expect(item.game_count).toBe(1);expect(item.last_game_update_at).not.toBeNull();expect(item.activity_estimated).toBe(false);const when=item.last_game_update_at;
 await db.exec('set role anon');const room=await call('jr_group_room',[groupA]);await call('jr_group_apply',[groupA,crypto.randomUUID(),device,{changes:[{kind:'settings',id:'settings',before:{name:room.state.name,rules:room.state.rules},after:{name:'大会名だけ変更',rules:room.state.rules}}]}]);await db.exec('set role authenticated');expect((await call('jr_admin_groups',[0,100,'A',false])).groups[0].last_game_update_at).toBe(when);expect((await call('jr_admin_stats')).total_games).toBe(1);
});
it('marks groups older than two calendar years as candidates only and does not treat never-played groups as old games',async()=>{
 await db.exec('reset role');await db.query("update jr_group_private.groups set last_game_update_at=now()-interval '3 years' where id=$1",[groupA]);await db.query("update jr_group_private.jr_public_changes set created_at=now()-interval '3 years' where room_id=$1 and kind='game'",[groupA]);
 await db.exec('set role authenticated');await identity(admin);const list=await call('jr_admin_groups',[0,100,'',true]);expect(list.total).toBe(1);expect(list.groups[0].id).toBe(groupA);expect(list.groups[0].deletion_candidate).toBe(true);expect((await call('jr_admin_stats')).deletion_candidates).toBe(1);
 await db.exec('set role anon');await headers({'x-janroku-group':a});expect((await call('jr_group_room',[groupA])).state.games).toHaveLength(1);await headers({'x-janroku-group':b});expect((await call('jr_group_info')).id).toBe(groupB);
});
it('issues a new alias after creation, scopes its reads and preserves all existing games',async()=>{
 await db.exec('set role anon');const token='c'.repeat(64),created=await call('jr_group_create',[crypto.randomUUID(),'C',token]);await db.exec('set role authenticated');await identity(admin);expect((await call('jr_admin_stats')).total_groups).toBe(3);expect((await call('jr_admin_groups',[0,100,'C',false])).groups[0].short_id).toMatch(/^[A-Za-z0-9_-]{16}$/);await db.exec('set role anon');await headers({'x-janroku-group':token});const link=(await call('jr_group_short_link')).short_id;expect(link).toMatch(/^[A-Za-z0-9_-]{16}$/);expect([linkA,linkB]).not.toContain(link);
 await headers({'x-janroku-view':link});expect((await call('jr_group_info')).id).toBe(created.id);expect((await call('jr_group_room',[groupA])).error).toBe('NOT_FOUND');await headers({'x-janroku-group':a});expect((await call('jr_group_room',[groupA])).state.games).toHaveLength(1);
});
it('enforces table RLS even if a direct select privilege is accidentally added, and revocation takes effect immediately',async()=>{
 await db.exec('reset role');await db.exec('grant usage on schema jr_group_private to authenticated;grant select on jr_group_private.admin_users,jr_group_private.group_links to authenticated;');await db.exec('set role authenticated');await identity(admin);expect((await db.query('select * from jr_group_private.admin_users')).rows).toEqual([]);expect((await db.query('select * from jr_group_private.group_links')).rows).toEqual([]);
 await db.exec('reset role');await db.query('delete from jr_group_private.admin_users where user_id=$1',[admin]);await db.exec('set role authenticated');await expect(call('jr_admin_stats')).rejects.toThrow('ADMIN_REQUIRED');await expect(call('jr_admin_groups')).rejects.toThrow('ADMIN_REQUIRED');
});
