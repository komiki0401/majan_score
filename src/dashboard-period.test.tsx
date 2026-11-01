// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeAll,beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import App from './App';
import {useCloud,type CloudConnection} from './cloud';
import {calculate,defaultRules,emptyState,type State,type Game} from './domain';
vi.mock('./cloud',()=>({useCloud:vi.fn(),cloudMessage:(e:unknown)=>String(e)}));
const names=['田中','佐藤','鈴木','高橋','伊藤','山本'];
function game(id:string,day:string,players:number[],scores:number[],round=1):Game{return {id,table:'1',round,date:day+'T03:00:00Z',playedOn:day,rules:structuredClone(defaultRules),revisions:[],rows:calculate(players.map((player,i)=>({playerId:String(player),score:scores[i]})),defaultRules)};}
function fixture():State{return {...structuredClone(emptyState),name:'期間テスト',players:names.map((name,i)=>({id:String(i),name})),games:[game('june','2026-06-07',[0,1,3,5],[20000,10000,40000,30000]),game('may1','2026-05-05',[0,1,2,3],[40000,30000,20000,10000]),game('may2','2026-05-05',[0,1,2,4],[10000,40000,30000,20000],2)]};}
let root:Root,host:HTMLDivElement,cloud:CloudConnection,remote:(state:State)=>void;
function button(text:string,scope:ParentNode=host){const b=[...scope.querySelectorAll('button')].find(e=>e.textContent?.trim()===text);if(!b)throw Error('Missing button: '+text);return b;}
async function click(el:Element){await act(async()=>{(el as HTMLElement).click();});}
async function tab(name:string){await click(button(name,host.querySelector('nav')!));}
async function day(value:string){if(value==='all')await click(button('全期間'));else{const b=[...host.querySelectorAll('.date-chips button')].find(e=>e.textContent?.startsWith(value));if(!b)throw Error('Missing date '+value);await click(b);}}
function player(name:string){const row=[...host.querySelectorAll('.rank-row')].find(e=>e.querySelector('b')?.textContent===name);if(!row)throw Error('Missing player '+name);return row;}
function points(name:string){return Number(player(name).querySelector('strong')!.textContent!.replace(/[^\d.+-]/g,''));}
function counts(){return [...host.querySelectorAll('.stat-card .stat-value')].map(e=>e.textContent);}
function allSummary(){expect(host.querySelector('.ranking-panel .pill')?.textContent).toBe('全期間');expect(points('佐藤')).toBe(20);expect(points('田中')).toBe(-10);expect(points('高橋')).toBe(10);expect(counts().slice(0,2)).toEqual(['3半荘','6人']);expect(host.querySelector('.rank-row b')?.textContent).toBe('佐藤');expect(host.querySelectorAll('[aria-label="グラフの対局"] option')).toHaveLength(3);expect(host.querySelector('.point-chart')?.getAttribute('aria-label')).toContain('全期間');expect(host.querySelectorAll('[data-player="田中"] circle')).toHaveLength(3);expect(host.querySelector('.live-commentary')?.textContent).toContain('佐藤');}
async function showLocal(){await act(async()=>{root.render(<App/>);});await click(button('端末内の記録を開く'));}
async function loadRoom(id:string,state=fixture()){
 cloud={...cloud,active:true,roomId:id,room:{id,state,version:1,updated_at:'2026-11-01T01:00:00Z',deleted_at:null}};
 await act(async()=>{remote(state);root.render(<App/>);});
}
beforeAll(()=>{(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});});
beforeEach(()=>{localStorage.clear();localStorage.setItem('janroku-v1',JSON.stringify(fixture()));cloud={active:false,config:null,roomId:null,room:null,rooms:[],changes:[],status:'未接続',message:'',saving:false,loading:false,selectRoom:vi.fn(),setMessage:vi.fn(),latest:()=>cloud.room} as unknown as CloudConnection;
 cloud.saveRemote=vi.fn(async(next:State)=>{cloud={...cloud,room:{...cloud.room!,version:cloud.room!.version+1,state:next}};remote(next);});
 vi.mocked(useCloud).mockImplementation(setState=>{remote=setState;return cloud;});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
describe('dashboard period filter with local storage',()=>{
 it('uses every date and half-game for all-period ranking, graph, statistics and personal results',async()=>{const original=localStorage.getItem('janroku-v1');await showLocal();await day('all');allSummary();await click(player('佐藤'));expect(host.querySelector('.detail-total')?.textContent).toContain('+20');expect(host.querySelectorAll('.detail-grid b')[0].textContent).toBe('3 回');expect(host.querySelectorAll('.detail-grid b')[1].textContent).toBe('2.33 位');expect(localStorage.getItem('janroku-v1')).toBe(original);});
 it('applies the same specific day to every dashboard view and returns to all data',async()=>{await showLocal();await day('5/5');expect(points('佐藤')).toBe(60);expect(counts().slice(0,2)).toEqual(['2半荘','5人']);expect(host.querySelectorAll('[aria-label="グラフの対局"] option')).toHaveLength(2);expect(host.querySelectorAll('[data-player="田中"] circle')).toHaveLength(2);await day('6/7');expect(points('高橋')).toBe(50);expect(counts().slice(0,2)).toEqual(['1半荘','4人']);expect(host.querySelectorAll('[aria-label="グラフの対局"] option')).toHaveLength(1);await day('all');allSummary();});
 it('keeps all-period selected after saving a half-game instead of forcing the saved date',async()=>{await showLocal();await day('all');allSummary();await click(button('スコアを入力'));await click(button('計算結果を確認'));await click(button('この結果を保存'));expect(host.querySelector('.ranking-panel .pill')?.textContent).toBe('全期間');expect(counts()[0]).toBe('4半荘');expect(host.querySelectorAll('[aria-label="グラフの対局"] option')).toHaveLength(4);const saved=JSON.parse(localStorage.getItem('janroku-v1')!);expect(saved.games.slice(0,3)).toEqual(fixture().games);});
});
describe('dashboard period filter with public cloud tournaments',()=>{
 it('does not overwrite an all-period selection made while a tournament is loading',async()=>{const original=localStorage.getItem('janroku-v1');cloud={...cloud,active:true,roomId:'room1',room:null};await act(async()=>root.render(<App/>));await tab('ダッシュボード');await day('all');await loadRoom('room1');await tab('ダッシュボード');allSummary();expect(localStorage.getItem('janroku-v1')).toBe(original);});
 it('keeps all-period totals after saving and after realtime updates on other dates',async()=>{await act(async()=>root.render(<App/>));await loadRoom('room1');await tab('ダッシュボード');await day('all');await click(button('スコアを入力'));await click(button('計算結果を確認'));await click(button('この結果を保存'));expect(host.querySelector('.ranking-panel .pill')?.textContent).toBe('全期間');expect(counts()[0]).toBe('4半荘');expect(host.querySelectorAll('[aria-label="グラフの対局"] option')).toHaveLength(4);const next={...cloud.room!.state,games:[...cloud.room!.state.games,{...game('peer','2026-07-08',[0,1,2,3],[40000,30000,20000,10000]),table:'2'}]};cloud={...cloud,room:{...cloud.room!,state:next,version:3}};await act(async()=>remote(next));expect(counts()[0]).toBe('5半荘');expect(host.querySelectorAll('[aria-label="グラフの対局"] option')).toHaveLength(5);expect(points('田中')).toBe(40);});
 it('keeps independent period choices per tournament and local records across reloads',async()=>{await showLocal();await day('5/5');await loadRoom('room1');await tab('ダッシュボード');allSummary();await day('6/7');cloud={...cloud,room:null};await act(async()=>root.render(<App/>));await loadRoom('room1');await tab('ダッシュボード');expect(counts()[0]).toBe('1半荘');expect(points('高橋')).toBe(50);await loadRoom('room2');await tab('ダッシュボード');allSummary();await loadRoom('room1');await tab('ダッシュボード');expect(counts()[0]).toBe('1半荘');cloud={...cloud,active:false,roomId:null,room:null};await act(async()=>{remote(fixture());root.render(<App/>);});expect(counts()[0]).toBe('2半荘');expect(points('佐藤')).toBe(60);});
});
