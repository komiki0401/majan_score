// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import App from './App';
import {freshSample,loadSample,saveSample,SAMPLE_KEY} from './sample';
import {Landing} from './Landing';
vi.mock('@supabase/supabase-js',()=>({createClient:vi.fn(()=>{throw Error('Sample must never create a Supabase client');})}));
let host:HTMLDivElement,root:Root;
beforeEach(()=>{(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}unobserve(){}});localStorage.clear();location.hash='#sample';host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.clearAllMocks();});
const button=(name:string,selector:ParentNode=host)=>{const element=[...selector.querySelectorAll('button')].find(b=>b.textContent?.trim()===name);if(!element)throw Error('Missing button '+name);return element;};
async function click(element:Element){await act(async()=>{element.dispatchEvent(new MouseEvent('click',{bubbles:true}));});}
async function input(element:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));});}
it('reuses the full score UI, saves and edits sample results locally, and leaves legacy storage/network untouched',async()=>{
 const legacy='legacy-data-must-survive';localStorage.setItem('janroku-v1',legacy);localStorage.setItem('janroku-local-history',legacy);
 const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('No network allowed'));
 await act(async()=>root.render(<App sample/>));
 expect(host.querySelector('.sample-banner')?.textContent).toContain('サンプル体験中');expect(host.querySelector('.ranking-panel')).not.toBeNull();
 await click(button('対局履歴'));expect(host.querySelectorAll('.history-card')).toHaveLength(12);expect(host.querySelector('.progress-panel')).not.toBeNull();
 await click(button('スコア入力＋'));await click(button('計算結果を確認'));await click(button('この結果を保存'));
 expect(loadSample().rooms[0].state.games).toHaveLength(9);
 await click(button('対局履歴'));await click(button('編集',host.querySelector('.history-card')!));expect(host.querySelector('.score-panel h2')?.textContent).toBe('対局結果を編集');
 await click(button('計算結果を確認'));await click(button('この結果を保存'));expect(loadSample().rooms.flatMap(r=>r.state.games).flatMap(g=>g.revisions)).toHaveLength(1);
 await click(button('設定'));expect(host.querySelector('[aria-label="Supabase Project URL"]')).toBeNull();
 expect(createClient).not.toHaveBeenCalled();expect(network).not.toHaveBeenCalled();expect(localStorage.getItem('janroku-v1')).toBe(legacy);expect(localStorage.getItem('janroku-local-history')).toBe(legacy);
 expect(localStorage.getItem('janroku-device-id')).toBeNull();
});
it('resets only sample records and preserves existing local records and connection settings',()=>{
 localStorage.setItem('janroku-v1','keep-real-data');localStorage.setItem('janroku-cloud-config','keep-connection');
 const edited=freshSample();edited.rooms[0].state.name='変更済み';edited.rooms[0].state.games=[];saveSample(edited);
 saveSample(freshSample());expect(loadSample().rooms[0].state.name).toBe('週末のなかよし卓');expect(loadSample().rooms[0].state.games).toHaveLength(8);
 expect(localStorage.getItem('janroku-v1')).toBe('keep-real-data');expect(localStorage.getItem('janroku-cloud-config')).toBe('keep-connection');
});
it('creates a sample tournament in local storage and reloads the selected tournament',async()=>{
 await act(async()=>root.render(<App sample/>));await click(button('大会管理'));
 await click(host.querySelector('.tournament-list-disclosure summary')!);
 await input(host.querySelector('[aria-label="新しい大会名"]')!,'おためし大会');await click(button('大会を作成'));
 const saved=loadSample();expect(saved.rooms).toHaveLength(3);expect(saved.rooms.find(r=>r.id===saved.selected)?.state.name).toBe('おためし大会');expect(host.querySelector('.score-tournament strong')?.textContent).toBe('おためし大会');
 expect(localStorage.getItem('janroku-v1')).toBeNull();expect(createClient).not.toHaveBeenCalled();
});
it('initializes fictional data without writing storage and rejects damaged data rather than overwriting it',()=>{
 const sample=freshSample();expect(sample.rooms.flatMap(r=>r.state.games)).toHaveLength(12);expect(localStorage.getItem(SAMPLE_KEY)).toBeNull();
 localStorage.setItem(SAMPLE_KEY,'broken');expect(()=>loadSample()).toThrow();expect(localStorage.getItem(SAMPLE_KEY)).toBe('broken');
});
it('offers the two landing actions without polling existing tournament data',async()=>{
 location.hash='';vi.useFakeTimers();
 localStorage.setItem('janroku-cloud-config',JSON.stringify({url:'https://test.supabase.co',key:'sb_publishable_test'}));
 const rpc=vi.fn(async()=>({data:{version:1},error:null}));vi.mocked(createClient).mockReturnValueOnce({rpc} as unknown as ReturnType<typeof createClient>);
 try{await act(async()=>root.render(<Landing/>));expect(host.querySelector('a[href="#sample"]')?.textContent).toContain('サンプルを体験する');expect(button('新しいグループを作成')).toBeTruthy();expect(host.querySelector('a[href="#legacy"]')).not.toBeNull();await act(async()=>vi.advanceTimersByTimeAsync(60000));expect(rpc.mock.calls).toHaveLength(1);}finally{vi.useRealTimers();}
});
