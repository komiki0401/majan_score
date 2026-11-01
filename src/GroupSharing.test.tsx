// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {GroupSharing} from './GroupSharing';
import {type CloudConnection} from './cloud';
let root:Root,host:HTMLDivElement;
beforeEach(()=>{(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('accepts only the group name and reports creation errors without losing the draft',async()=>{const createGroup=vi.fn().mockRejectedValue(Error('接続を確認してください'));const cloud={groupAvailable:true,client:{},createGroup} as unknown as CloudConnection;await act(async()=>root.render(<GroupSharing cloud={cloud}/>));expect(host.querySelector('form')).toBeNull();await act(async()=>host.querySelector('button')!.click());const input=host.querySelector('input')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'週末の仲間');input.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(createGroup).toHaveBeenCalledWith('週末の仲間');expect(input.value).toBe('週末の仲間');expect(host.querySelector('[role="alert"]')?.textContent).toBe('接続を確認してください');});
it('keeps legacy use available and creation disabled until the additive database migration is ready',async()=>{const cloud={groupAvailable:false,client:{}} as unknown as CloudConnection;await act(async()=>root.render(<GroupSharing cloud={cloud}/>));expect(host.querySelector('button')?.disabled).toBe(true);expect(host.textContent).toContain('準備中');expect(host.querySelector('form')).toBeNull();});
