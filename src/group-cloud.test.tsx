// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import {useCloud,type CloudConnection} from './cloud';
import {emptyState} from './domain';
import {useAllTournamentScores} from './useAllTournamentScores';
import {prepareGroupTournament} from './group-initial-tournament';
import {tournamentName} from './tournament-name';
vi.mock('@supabase/supabase-js',()=>({createClient:vi.fn()}));
vi.mock('./group-initial-tournament',()=>({prepareGroupTournament:vi.fn(async()=>{})}));
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
it('opens a short URL read-only and blocks writes before issuing requests',async()=>{
 location.hash='#/g/a7K9m2Ab_cD-1234?room='+id;await mount();expect(cloud.readOnly).toBe(true);expect(cloud.groupName).toBe('仲間の雀録');expect(vi.mocked(createClient).mock.calls.at(-1)?.[2]?.global?.headers).toEqual({'x-janroku-view':'a7K9m2Ab_cD-1234'});
 rpc.mockClear();await expect(cloud.saveRemote(emptyState,emptyState)).rejects.toThrow('READ_ONLY');await expect(cloud.createRoom(emptyState)).rejects.toThrow('READ_ONLY');await expect(cloud.renameRoom(id,'変更')).rejects.toThrow('READ_ONLY');expect(rpc).not.toHaveBeenCalled();expect(cloud.editorShareURL()).toBeNull();expect(cloud.shareURL()).not.toContain('edit');
});
it('issues a short viewing URL while keeping editing available only to its creator browser or invitation',async()=>{
 await mount();const original=rpc.getMockImplementation()!;rpc.mockImplementation(async(name:string)=>name==='jr_group_short_link'?{data:{short_id:'a7K9m2Ab_cD-1234'},error:null}:original(name));
 const url=await cloud.createGroup('新しい仲間');expect(url).toBe('https://example.com/majan_score/#/g/a7K9m2Ab_cD-1234');expect(url).not.toMatch(/project=|key=|edit=/);expect(localStorage.getItem(Object.keys(localStorage).find(key=>key.startsWith('janroku-group-editor:')&&key.endsWith(':a7K9m2Ab_cD-1234'))!)).toMatch(/^[a-f0-9]{64}$/);
});
it('initializes the date name only for a newly issued group URL and never reapplies it after success',async()=>{await mount();await cloud.createGroup('新しい仲間');expect(prepareGroupTournament).toHaveBeenCalledTimes(1);expect(vi.mocked(prepareGroupTournament).mock.calls[0][4]).toMatch(/^\d{4}\/\d{2}\/\d{2}（[日月火水木金土]）麻雀会$/);await cloud.createGroup('新しい仲間');expect(prepareGroupTournament).toHaveBeenCalledTimes(1);});
it('reuses the same automatically named creation after an uncertain response instead of creating another suffix',async()=>{
 await mount();const base=tournamentName('2026-11-01'),newId='22222222-2222-4222-8222-222222222222';let attempts=0;
 rpc.mockImplementation(async(name:string,args?:{initial_state?:typeof emptyState})=>{
  if(name==='jr_group_index')return {data:[{room_id:id,version:2,updated_at:'date'}],error:null};
  if(name==='jr_group_room')return {data:{id,state:{...structuredClone(emptyState),name:base},version:2,updated_at:'date',deleted_at:null},error:null};
  if(name==='jr_group_tournament_create'){attempts++;return attempts===1?{data:null,error:{message:'offline'}}:{data:{id:newId,state:args!.initial_state,version:1,updated_at:'date',deleted_at:null},error:null};}
  return {data:[],error:null};
 });
 await act(async()=>{await expect(cloud.createRoom({...structuredClone(emptyState),name:base},'2026-11-01')).rejects.toThrow();});
 await act(async()=>{await cloud.createRoom({...structuredClone(emptyState),name:base+'③'},'2026-11-01');});
 const calls=rpc.mock.calls.filter(([name])=>name==='jr_group_tournament_create') as unknown as [string,{request_id:string;initial_state:typeof emptyState}][];
 expect(calls[0][1].initial_state.name).toBe(base+'②');expect(calls[1][1].initial_state.name).toBe(base+'②');expect(calls[1][1].request_id).toBe(calls[0][1].request_id);
});
it('uses scoped headers and APIs, never public history or Realtime, and preserves the capability in shared URLs',async()=>{await mount();expect(vi.mocked(createClient).mock.calls.at(-1)?.[2]?.global?.headers).toEqual({'x-janroku-group':token});expect(cloud.groupMode).toBe(true);expect(cloud.groupName).toBe('仲間の雀録');expect(cloud.room?.state.name).toBe('仲間の大会');expect(from).not.toHaveBeenCalled();expect(channel).not.toHaveBeenCalled();expect(rpc.mock.calls.every(([name])=>name.startsWith('jr_group_'))).toBe(true);expect(new URLSearchParams(new URL(cloud.shareURL()).hash.slice(1)).get('group')).toBe(token);});
it('never constructs a client for an invalid capability',async()=>{location.hash='#group=bad';await mount();expect(createClient).not.toHaveBeenCalled();expect(cloud.client).toBeNull();expect(cloud.groupError).toBeTruthy();});
it('keeps a failed creation retry idempotent and returns the URL only after confirmed creation',async()=>{await mount();rpc.mockImplementation(async(name:string)=>name==='jr_group_create'?{data:null,error:{message:'offline'}}:{data:{},error:null});await expect(cloud.createGroup('新しい仲間')).rejects.toThrow();const first=rpc.mock.calls.find(([name])=>name==='jr_group_create') as unknown as [string,{request_id:string;access_token:string}];expect(assign).not.toHaveBeenCalled();rpc.mockImplementation(async()=>({data:{room_id:id},error:null}));const url=await cloud.createGroup('新しい仲間');const last=rpc.mock.calls.filter(([name])=>name==='jr_group_create').at(-1) as unknown as [string,{request_id:string;access_token:string}];expect(last[1].request_id).toBe(first[1].request_id);expect(last[1].access_token).toBe(first[1].access_token);expect(url).toContain('#group='+first[1].access_token);expect(assign).not.toHaveBeenCalled();});

it('works without session storage and keeps in-memory retries stable',async()=>{await mount();const storage=vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('blocked');});const save=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('blocked');});const clear=vi.spyOn(Storage.prototype,'removeItem').mockImplementation(()=>{throw Error('blocked');});try{rpc.mockImplementation(async()=>({data:null,error:{message:'offline'}}));await expect(cloud.createGroup('保存制限のあるブラウザ')).rejects.toThrow('再試行');const first=rpc.mock.calls.filter(([name])=>name==='jr_group_create').at(-1) as unknown as [string,{request_id:string;access_token:string}];rpc.mockImplementation(async()=>({data:{room_id:id},error:null}));const url=await cloud.createGroup('保存制限のあるブラウザ');const second=rpc.mock.calls.filter(([name])=>name==='jr_group_create').at(-1) as unknown as [string,{request_id:string;access_token:string}];expect(second[1].request_id).toBe(first[1].request_id);expect(second[1].access_token).toBe(first[1].access_token);expect(url).toContain(first[1].access_token);}finally{storage.mockRestore();save.mockRestore();clear.mockRestore();}});
it('ignores damaged pending storage and gives actionable rate-limit and permission errors',async()=>{await mount();const storage=vi.spyOn(Storage.prototype,'getItem').mockReturnValue('{invalid-json');try{rpc.mockImplementation(async()=>({data:{error:'RATE_LIMIT'},error:null}));await expect(cloud.createGroup('テスト')).rejects.toThrow('1分');rpc.mockImplementation(async()=>({data:null,error:{code:'42501',message:'private detail'}}));await expect(cloud.createGroup('テスト')).rejects.toThrow('GROUP_PERMISSION_DENIED');expect(assign).not.toHaveBeenCalled();}finally{storage.mockRestore();}});

it('recovers the same URL if the creation form is submitted again after success',async()=>{await mount();const first=await cloud.createGroup('同じ仲間');const request=rpc.mock.calls.filter(([name])=>name==='jr_group_create').at(-1) as unknown as [string,{request_id:string;access_token:string}];const second=await cloud.createGroup('同じ仲間');const retry=rpc.mock.calls.filter(([name])=>name==='jr_group_create').at(-1) as unknown as [string,{request_id:string;access_token:string}];expect(second).toBe(first);expect(retry[1].request_id).toBe(request[1].request_id);expect(retry[1].access_token).toBe(request[1].access_token);});

it('uses one shared index request per unchanged foreground cycle and detects another device update',async()=>{
 vi.useFakeTimers();let version=1,visibility='visible';
 const visible=vi.spyOn(document,'visibilityState','get').mockImplementation(()=>visibility as DocumentVisibilityState);
 const original=rpc.getMockImplementation()!;
 rpc.mockImplementation(async(name:string)=>name==='jr_group_index'?{data:[{room_id:id,version,updated_at:'date'}],error:null}:name==='jr_group_room'?{data:{id,version,state:{...structuredClone(emptyState),name:'大会'+version},updated_at:'date',deleted_at:null},error:null}:original(name));
 let scores:ReturnType<typeof useAllTournamentScores>;
 function Example(){cloud=useCloud(onState);scores=useAllTournamentScores(cloud,true);return null;}
 try{
  await act(async()=>root.render(<Example/>));
  expect(rpc.mock.calls.filter(([name])=>name==='jr_group_room')).toHaveLength(1);
  rpc.mockClear();onState.mockClear();const before=scores!.state;
  await act(async()=>vi.advanceTimersByTimeAsync(60000));
  expect(rpc.mock.calls.map(([name])=>name)).toEqual(Array(4).fill('jr_group_index'));
  expect(onState).not.toHaveBeenCalled();expect(scores!.state).toBe(before);
  visibility='hidden';await act(async()=>document.dispatchEvent(new Event('visibilitychange')));rpc.mockClear();
  await act(async()=>vi.advanceTimersByTimeAsync(60000));expect(rpc).not.toHaveBeenCalled();
  version=2;visibility='visible';await act(async()=>document.dispatchEvent(new Event('visibilitychange')));
  expect(cloud.room?.version).toBe(2);expect(scores!.state).not.toBe(before);
  expect(rpc.mock.calls.filter(([name])=>name==='jr_group_room')).toHaveLength(1);
  expect(rpc.mock.calls.filter(([name])=>name==='jr_group_changes')).toHaveLength(1);
 }finally{await act(async()=>root.unmount());visible.mockRestore();vi.useRealTimers();root=createRoot(host);}
});
