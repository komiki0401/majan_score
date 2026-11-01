import {afterEach,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {cloudReader} from './cloud-reader';
import {emptyState} from './domain';
afterEach(()=>{vi.useRealTimers();});
it('shares index requests, downloads only changed versions, and isolates different group clients',async()=>{
 vi.useFakeTimers();let version=1;
 const rpc=vi.fn(async(name:string)=>({data:name==='jr_group_index'?[{room_id:'one',version,updated_at:'date'}]:{id:'one',version,state:emptyState,deleted_at:null,updated_at:'date'},error:null}));
 const client={rpc} as unknown as SupabaseClient,reader=cloudReader(client,true);
 expect(cloudReader(client,true)).toBe(reader);
 const indexes=await Promise.all([reader.index(),reader.index(),reader.index()]);expect(rpc).toHaveBeenCalledTimes(1);expect(indexes[0]).toBe(indexes[1]);
 await Promise.all([reader.room('one',1),reader.room('one',1)]);expect(rpc).toHaveBeenCalledTimes(2);
 for(let i=0;i<4;i++){await vi.advanceTimersByTimeAsync(15000);const index=await reader.index();expect(index).toBe(indexes[0]);await reader.room('one',index[0].version);}
 expect(rpc.mock.calls.filter(([name])=>name==='jr_group_room')).toHaveLength(1);
 expect(rpc.mock.calls.filter(([name])=>name==='jr_group_index')).toHaveLength(5);
 version=2;await vi.advanceTimersByTimeAsync(15000);const changed=await reader.index();expect(changed).not.toBe(indexes[0]);expect((await reader.room('one',changed[0].version)).version).toBe(2);
 const other=cloudReader({rpc} as unknown as SupabaseClient,true);await other.room('one',2);expect(rpc.mock.calls.filter(([name])=>name==='jr_group_room')).toHaveLength(3);
});
it('never replaces a newer saved room with an older in-flight response',async()=>{
 let complete:(value:unknown)=>void=()=>{};const rpc=vi.fn(()=>new Promise(resolve=>{complete=resolve;}));
 const reader=cloudReader({rpc} as unknown as SupabaseClient,true);const pending=reader.room('one',1);
 reader.prime({id:'one',version:3,state:emptyState,deleted_at:null,updated_at:'date'});
 complete({data:{id:'one',version:1,state:emptyState,deleted_at:null,updated_at:'date'},error:null});expect((await pending).version).toBe(3);
});
