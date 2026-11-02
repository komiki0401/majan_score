// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import AdminDashboard from './AdminDashboard';
vi.mock('@supabase/supabase-js',()=>({createClient:vi.fn()}));
vi.mock('./cloud',()=>({readConfig:()=>({url:'https://test.supabase.co',key:'sb_publishable_test'})}));
let root:Root,host:HTMLDivElement,rpc:ReturnType<typeof vi.fn>,verify:ReturnType<typeof vi.fn>,signOut:ReturnType<typeof vi.fn>;
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 verify=vi.fn(async()=>({error:null}));signOut=vi.fn(async()=>({error:null}));
 rpc=vi.fn(async(name:string)=>({error:null,data:name==='jr_admin_stats'?{total_groups:1,new_this_month:1,active_groups:1,total_games:4,deletion_candidates:0}:{total:1,groups:[{id:'operator-visible-id',name:'管理テスト',created_at:'2026-11-01',last_game_update_at:null,game_count:4,player_count:4,status:'active',short_id:'a7K9m2Ab_cD-1234',deletion_candidate:false,activity_estimated:false}]}}));
 vi.mocked(createClient).mockReturnValue({rpc,auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe:vi.fn()}}}),stopAutoRefresh:vi.fn(),signInWithPassword:vi.fn(async()=>({error:null})),signOut,mfa:{listFactors:vi.fn(async()=>({data:{totp:[{id:'verified-factor',status:'verified'}]},error:null})),challengeAndVerify:verify}}} as unknown as ReturnType<typeof createClient>);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.clearAllMocks();});
async function mount(){await act(async()=>root.render(<AdminDashboard/>));}
async function submit(){await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
it('requests no management information before password plus MFA, uses memory auth and copies only viewing URLs',async()=>{
 await mount();expect(rpc).not.toHaveBeenCalled();expect(vi.mocked(createClient).mock.calls[0][2]?.auth).toMatchObject({persistSession:false,detectSessionInUrl:false});
 await submit();expect(host.textContent).toContain('認証アプリの確認');expect(rpc).not.toHaveBeenCalled();await submit();expect(verify).toHaveBeenCalled();expect(rpc.mock.calls.map(([name])=>name)).toEqual(['jr_admin_stats','jr_admin_groups']);expect(host.textContent).toContain('管理テスト');const input=host.querySelector('input[aria-label="管理テストの閲覧URL"]') as HTMLInputElement;expect(input.value).toContain('#/g/a7K9m2Ab_cD-1234');expect(input.value).not.toContain('edit=');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='ログアウト')!.click());expect(signOut).toHaveBeenCalled();expect(host.textContent).not.toContain('管理テスト');
});
it('does not show management data when the database rejects the user, even after MFA',async()=>{
 rpc.mockResolvedValue({data:null,error:{code:'42501'}});await mount();await submit();await submit();expect(host.textContent).toContain('管理者権限を確認できません');expect(host.textContent).not.toContain('累計発行グループ数');
});
it('does not request management data when MFA verification fails',async()=>{
 verify.mockResolvedValue({error:{message:'invalid'}});await mount();await submit();await submit();expect(rpc).not.toHaveBeenCalled();expect(host.textContent).toContain('認証コードを確認できません');
});
it('ignores an in-flight management response after logout',async()=>{
 let resolve!:(value:any)=>void;const pending=new Promise<any>(r=>resolve=r);rpc.mockReturnValue(pending);await mount();await submit();await act(async()=>{host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='ログアウト')!.click());await act(async()=>resolve({data:{total_groups:999,total:0,groups:[]},error:null}));expect(host.textContent).not.toContain('999');expect(host.textContent).toContain('管理者ログイン');
});
