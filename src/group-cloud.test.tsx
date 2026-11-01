// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import {useCloud,type CloudConnection} from './cloud';
import {emptyState} from './domain';
vi.mock('@supabase/supabase-js',()=>({createClient:vi.fn()}));
let root:Root,host:HTMLDivElement,cloud:CloudConnection,rpc:ReturnType<typeof vi.fn>,from:ReturnType<typeof vi.fn>,channel:ReturnType<typeof vi.fn>,assign:ReturnType<typeof vi.fn>;
const token='a'.repeat(64),id='11111111-1111-4111-8111-111111111111',onState=vi.fn();
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 localStorage.clear();sessionStorage.clear();localStorage.setItem('janroku-cloud-config',JSON.stringify({url:'https://test.supabase.co',key:'sb_publishable_test'}));
 assign=vi.fn();vi.stubGlobal('location',{hash:'#group='+token+'&room='+id,origin:'https://example.com',pathname:'/majan_score/',assign});
 rpc=vi.fn(async(name:string)=>({data:name==='jr_group_status'?{version:1}:name==='jr_group_info'?{name:'仲間の雀録',id}:name==='jr_group_room'?{id,state:{...structuredClone(emptyState),name:'仲間の大会'},version:1,updated_at:'date',deleted_at:null}:name==='jr_group_create'?{room_id:id}:[],error:null}));
 from=vi.fn(()=>{throw Error('Public tables must not be used in group mode');});channel=vi.fn(()=>{throw Error('Group credentials must not be sent to Realtime');});
 vi.mocked(createClient).mockReturnValue({rpc,from,channel} as unknown as ReturnType<typeof createClient>);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();vi.clearAllMocks();});
async function mount(){function Example(){cloud=useCloud(onState);return null;}await act(async()=>root.render(<Example/>));}
it('uses scoped headers and APIs, never public history or Realtime, and preserves the capability in shared URLs',async()=>{await mount();expect(vi.mocked(createClient).mock.calls.at(-1)?.[2]?.global?.headers).toEqual({'x-janroku-group':token});expect(cloud.groupMode).toBe(true);expect(cloud.groupName).toBe('仲間の雀録');expect(cloud.room?.state.name).toBe('仲間の大会');expect(from).not.toHaveBeenCalled();expect(channel).not.toHaveBeenCalled();expect(rpc.mock.calls.every(([name])=>name.startsWith('jr_group_'))).toBe(true);expect(new URLSearchParams(new URL(cloud.shareURL()).hash.slice(1)).get('group')).toBe(token);});
it('never constructs a client for an invalid capability',async()=>{location.hash='#group=bad';await mount();expect(createClient).not.toHaveBeenCalled();expect(cloud.client).toBeNull();expect(cloud.groupError).toBeTruthy();});
it('keeps a failed creation retry idempotent and navigates only after confirmed creation',async()=>{await mount();rpc.mockImplementation(async(name:string)=>name==='jr_group_create'?{data:null,error:{message:'offline'}}:{data:{},error:null});await expect(cloud.createGroup('新しい仲間')).rejects.toThrow();const first=rpc.mock.calls.find(([name])=>name==='jr_group_create') as unknown as [string,{request_id:string;access_token:string}];expect(assign).not.toHaveBeenCalled();rpc.mockImplementation(async()=>({data:{room_id:id},error:null}));await cloud.createGroup('新しい仲間');const last=rpc.mock.calls.at(-1) as unknown as [string,{request_id:string;access_token:string}];expect(last[1].request_id).toBe(first[1].request_id);expect(last[1].access_token).toBe(first[1].access_token);expect(assign).toHaveBeenCalledWith(expect.stringContaining('#group='+first[1].access_token));});
