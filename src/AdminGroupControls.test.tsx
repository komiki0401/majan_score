// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {AdminGroupControls} from './AdminGroupControls';
const group={id:'11111111-1111-4111-8111-111111111111',name:'テスト雀録',status:'disabled'};
const counts={groups:1,links:1,rooms:2,games:4,changes:6,events:2,requests:3,rates:4};
let host:HTMLDivElement,root:Root,rpc:ReturnType<typeof vi.fn>,changed:ReturnType<typeof vi.fn>,denied:ReturnType<typeof vi.fn>,download:ReturnType<typeof vi.spyOn>;
const backup=()=>({format:'janroku-group-backup-v1',receipt:'receipt-id',expires_at:new Date(Date.now()+900000).toISOString(),snapshot:{group:{id:group.id}},counts});
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 rpc=vi.fn(async(name:string)=>({error:null,data:name==='jr_admin_group_preview'?{...group,counts}:name==='jr_admin_group_export'?backup():name==='jr_admin_group_delete'?{id:group.id,deleted:true}:{id:group.id,status:'active'}}));changed=vi.fn();denied=vi.fn();
 Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=> 'blob:test')});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()});download=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});vi.spyOn(window,'confirm').mockReturnValue(true);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
async function mount(status='disabled'){await act(async()=>root.render(<AdminGroupControls group={{...group,status}} client={{rpc} as unknown as SupabaseClient} onChanged={changed} onDenied={denied}/>));}
async function click(label:string){await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent===label)!.click());}
async function input(label:string,value:string){const node=document.querySelector(`[aria-label="${label}"]`)!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});}
it('requires confirmation for disable and restores using the same group with a server-side status precondition',async()=>{
 await mount('active');vi.mocked(window.confirm).mockReturnValue(false);await click('無効化');expect(rpc).not.toHaveBeenCalled();vi.mocked(window.confirm).mockReturnValue(true);rpc.mockResolvedValue({data:{id:group.id,status:'disabled'},error:null});await click('無効化');expect(rpc).toHaveBeenCalledWith('jr_admin_group_status',{target:group.id,expected_status:'active',new_status:'disabled'});expect(changed).toHaveBeenCalledTimes(1);
 await mount();rpc.mockResolvedValue({data:{id:group.id,status:'active'},error:null});await click('復元');expect(rpc).toHaveBeenLastCalledWith('jr_admin_group_status',{target:group.id,expected_status:'disabled',new_status:'active'});
});
it('shows counts first and submits deletion only after downloading, checking the file and typing both identifiers',async()=>{
 await mount();await click('バックアップ・完全削除');expect(rpc).toHaveBeenCalledWith('jr_admin_group_preview',{target:group.id},{get:true});expect(document.querySelector('[role=dialog]')?.textContent).toContain('変更・復元履歴');expect(document.querySelector('form')).toBeNull();await click('削除前のJSONバックアップをダウンロード');expect(download).toHaveBeenCalledTimes(1);expect(rpc.mock.calls.some(([n])=>n==='jr_admin_group_delete')).toBe(false);
 const button=()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='このグループを完全削除する')!;expect(button().disabled).toBe(true);
 await input('完全削除するグループ名',group.name);await input('完全削除するグループID',group.id);expect(button().disabled).toBe(true);await act(async()=>document.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());expect(button().disabled).toBe(false);await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(rpc).toHaveBeenLastCalledWith('jr_admin_group_delete',{target:group.id,export_receipt:'receipt-id',confirm_name:group.name,confirm_id:group.id,backup_saved:true});expect(changed).toHaveBeenCalled();expect(document.querySelector('[role=dialog]')).toBeNull();
});
it('does not enable deletion if starting the backup download fails',async()=>{
 await mount();await click('バックアップ・完全削除');download.mockImplementation(()=>{throw Error('blocked');});await click('削除前のJSONバックアップをダウンロード');expect(document.querySelector('form')).toBeNull();expect(rpc.mock.calls.some(([n])=>n==='jr_admin_group_delete')).toBe(false);
});
it('closes sensitive review data and requests reauthentication on database access denial',async()=>{
 await mount();await click('バックアップ・完全削除');rpc.mockResolvedValue({data:null,error:{code:'42501'}});await click('削除前のJSONバックアップをダウンロード');expect(denied).toHaveBeenCalledTimes(1);expect(document.querySelector('[role=dialog]')).toBeNull();
});
it('does not download a late export response after logout/unmount',async()=>{
 await mount();await click('バックアップ・完全削除');let resolve!:(value:any)=>void;rpc.mockReturnValue(new Promise(r=>resolve=r));await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='削除前のJSONバックアップをダウンロード')!.click());await act(async()=>root.render(null));await act(async()=>resolve({data:backup(),error:null}));expect(download).not.toHaveBeenCalled();expect(changed).not.toHaveBeenCalled();
});
