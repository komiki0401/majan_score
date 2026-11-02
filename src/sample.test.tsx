// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import App from './App';
import {freshSample,loadSample,saveSample,SAMPLE_KEY} from './sample';
import {Landing} from './Landing';
import {tournamentName} from './tournament-name';
import {calculate,standings,personalRankProgress,type State} from './domain';
import {allTournamentState,recentTournament} from './all-tournaments';
vi.mock('@supabase/supabase-js',()=>({createClient:vi.fn(()=>{throw Error('Sample must never create a Supabase client');})}));
let host:HTMLDivElement,root:Root;
beforeEach(()=>{(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}unobserve(){}});localStorage.clear();location.hash='#sample';host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.clearAllMocks();});
const button=(name:string,selector:ParentNode=host)=>{const element=[...selector.querySelectorAll('button')].find(b=>b.textContent?.trim()===name);if(!element)throw Error('Missing button '+name);return element;};
async function click(element:Element){await act(async()=>{element.dispatchEvent(new MouseEvent('click',{bubbles:true}));});}
async function input(element:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));});}
function selectedSampleRoom(){const sample=loadSample();return sample.rooms.find(room=>room.id===sample.selected)!;}
function assertDashboard(state:State){
 const expected=standings(state).filter(player=>player.count),rows=[...host.querySelectorAll('.rank-row')];
 expect(rows.map(row=>row.querySelector('.player-cell b')?.textContent)).toEqual(expected.map(player=>player.name));
 for(const [i,player] of expected.entries()){expect(Number(rows[i].querySelector('strong')?.textContent?.replace('pt','').trim())).toBe(player.total);expect(rows[i].querySelector('.rank-medal')?.textContent).toBe(String(i+1));}
 const values=[...host.querySelectorAll('.stats-grid .stat-value')].map(node=>node.textContent);
 expect(values).toEqual([state.games.length+'半荘',expected.length+'人',expected[0]?.name??'—']);
}
function assertHistory(state:State){
 const expected=standings(state).filter(player=>player.count),rows=[...host.querySelectorAll('.points-table tbody tr')];
 expect(host.querySelectorAll('.history-card')).toHaveLength(state.games.length);expect(rows.map(row=>row.querySelector('th')?.textContent)).toEqual(expected.map(player=>player.name));
 for(const [i,player] of expected.entries())expect(Number(rows[i].querySelector('.points-total')?.textContent)).toBe(player.total);
 for(const player of personalRankProgress(state)){const group=[...host.querySelectorAll('.point-chart g[data-player]')].find(node=>node.getAttribute('data-player')===player.name)!;expect([...group.querySelectorAll('circle title')].map(title=>title.textContent?.split('：').at(-1))).toEqual(player.entries.map(entry=>entry.rank+'位'));}
 expect(host.querySelectorAll('.point-chart circle')).toHaveLength(state.games.reduce((sum,game)=>sum+game.rows.length,0));
}
async function remountSample(){await act(async()=>root.unmount());root=createRoot(host);await act(async()=>root.render(<App sample/>));}
it('opens today for sample input, reuses it after reload, and shows the saved result as the latest tournament',async()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-02T09:00:00'));const yesterday=freshSample().rooms[0];
 const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('No network allowed'));
 try{
  await act(async()=>root.render(<App sample/>));await click(button('スコア入力＋'));const todayId=loadSample().selected;
  expect(host.querySelector('.score-tournament strong')?.textContent).toBe('2026/11/02（月）麻雀会');expect(host.querySelector<HTMLInputElement>('[aria-label="対局日"]')?.value).toBe('2026-11-02');expect(selectedSampleRoom().state.players).toEqual(yesterday.state.players);expect(selectedSampleRoom().state.games).toHaveLength(0);
  await click(button('ダッシュボード'));await click(button('スコア入力＋'));expect(loadSample().selected).toBe(todayId);expect(loadSample().rooms).toHaveLength(2);
  for(const [i,score] of [80000,10000,5000,5000].entries())await input(host.querySelector(`[aria-label="${i+1}人目の持ち点"]`)!,String(score));
  await click(button('計算結果を確認'));await click(button('この結果を保存'));
  expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('直近の大会');expect(recentTournament(loadSample().rooms)?.id).toBe(todayId);assertDashboard(selectedSampleRoom().state);
  expect(loadSample().rooms[0]).toEqual(yesterday);await remountSample();assertDashboard(selectedSampleRoom().state);await click(button('スコア入力＋'));expect(loadSample().selected).toBe(todayId);expect(loadSample().rooms).toHaveLength(2);
  vi.setSystemTime(new Date('2026-11-03T09:00:00'));await click(button('スコア入力＋'));expect(loadSample().rooms).toHaveLength(3);expect(host.querySelector('.score-tournament strong')?.textContent).toBe('2026/11/03（火）麻雀会');expect(host.querySelector<HTMLInputElement>('[aria-label="対局日"]')?.value).toBe('2026-11-03');expect(loadSample().rooms[0]).toEqual(yesterday);
  expect(createClient).not.toHaveBeenCalled();expect(network).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
});
it('keeps score entry available after every sample tournament is archived and can start a new tournament',async()=>{
 const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('No production access'));vi.spyOn(window,'confirm').mockReturnValue(true);
 await act(async()=>root.render(<App sample/>));await click(button('大会管理'));await click(host.querySelector('.tournament-list-disclosure summary')!);
 while(host.querySelector('.room-card .danger'))await click(host.querySelector('.room-card .danger')!);
 const archived=loadSample().rooms;expect(archived.every(room=>room.deleted_at)).toBe(true);
 await click(button('スコア入力＋'));expect(host.querySelector('.breadcrumb strong')?.textContent).toBe('スコア入力');expect(host.querySelector('[aria-label="新しい大会名"]')).not.toBeNull();
 await remountSample();await click(button('スコア入力＋'));expect(host.querySelector('.breadcrumb strong')?.textContent).toBe('スコア入力');
 await input(host.querySelector('[aria-label="新しい大会名"]')!,'再開の大会');await click(button('大会を作成'));expect(host.querySelector('.score-tournament strong')?.textContent).toBe('再開の大会');
 await click(button('参加者を登録'));for(const name of ['東さん','南さん','西さん','北さん']){await input(host.querySelector('[aria-label="参加者名"]')!,name);await click(button('追加',host.querySelector('.add-player')!));}
 await click(button('スコア入力＋'));await click(button('計算結果を確認'));await click(button('この結果を保存'));expect(loadSample().rooms.at(-1)?.state.games).toHaveLength(1);assertDashboard(loadSample().rooms.at(-1)!.state);
 expect(loadSample().rooms.slice(0,archived.length)).toEqual(archived);expect(network).not.toHaveBeenCalled();expect(createClient).not.toHaveBeenCalled();
});
it('immediately shows a scored sample tournament on the dashboard before the seed timestamp',async()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-02T00:00:00Z'));
 try{await act(async()=>root.render(<App sample/>));await click(button('スコア入力＋'));
  for(const [i,score] of [80000,10000,5000,5000].entries())await input(host.querySelector(`[aria-label="${i+1}人目の持ち点"]`)!,String(score));
  await click(button('計算結果を確認'));await click(button('この結果を保存'));
  expect(host.querySelector('.stats-grid .stat-value')?.textContent).toBe('1半荘');
  const expected=standings(selectedSampleRoom().state);for(const player of expected){const row=[...host.querySelectorAll('.rank-row')].find(row=>row.querySelector('.player-cell b')?.textContent===player.name)!;expect(Number(row.querySelector('strong')?.textContent?.replace('pt','').trim())).toBe(player.total);}
 }finally{vi.useRealTimers();}
});
it('reflects sample add, edit and delete in every aggregate immediately and after reload, with no production access',async()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-02T00:00:00Z'));
 const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('Network forbidden'));
 const canaries={'janroku-v1':'keep-local-records','janroku-cloud-config':JSON.stringify({url:'https://real.supabase.co',key:'sb_publishable_test'}),'jr-group-pending:real':'keep-group-draft'};
 for(const [key,value] of Object.entries(canaries))localStorage.setItem(key,value);
 const original=freshSample();const another=structuredClone(original.rooms[0]);another.id='sample-room-1';another.state.name='別の大会';another.state.games=another.state.games.map(game=>({...game,id:'sample-game-1-0'}));original.rooms.push(another);saveSample(original);
 try{
  await act(async()=>root.render(<App sample/>));await click(button('スコア入力＋'));
  const ids=[1,2,3,4].map(i=>host.querySelector<HTMLSelectElement>(`[aria-label="${i}人目の参加者"]`)!.value),scores=[80000,10000,5000,5000];
  for(const [i,score] of scores.entries())await input(host.querySelector(`[aria-label="${i+1}人目の持ち点"]`)!,String(score));
  await click(button('計算結果を確認'));await click(button('この結果を保存'));
  const added=selectedSampleRoom().state.games.at(-1)!;
  expect(added.rows).toEqual(calculate(ids.map((playerId,i)=>({playerId,score:scores[i]})),original.rooms[0].state.rules));assertDashboard(recentTournament(loadSample().rooms)!.state);
  await click(button('全大会・累計'));assertDashboard(allTournamentState(loadSample().rooms));
  await click(host.querySelector('.rank-row')!);const leader=standings(allTournamentState(loadSample().rooms))[0];
  expect(Number(host.querySelector('.detail-total')?.textContent?.replace('pt','').trim())).toBe(leader.total);
  expect([...host.querySelectorAll('.detail-grid b')].slice(0,2).map(node=>node.textContent)).toEqual([leader.count+' 回',leader.average.toFixed(2)+' 位']);
  expect([...host.querySelectorAll('.distribution>b')].map(node=>node.textContent)).toEqual(leader.ranks.map(count=>count+' 回'));
  await click(host.querySelector('.modal [aria-label="閉じる"]')!);
  await click(button('対局履歴'));assertHistory(allTournamentState(loadSample().rooms));
  const card=()=>[...host.querySelectorAll('.history-card')].find(node=>node.querySelector('.history-title b')?.textContent?.includes(selectedSampleRoom().state.name)&&node.querySelector('.history-title small')?.textContent===added.playedOn!.split('-').map((value,i)=>Number(value)+['年','月','日'][i]).join(''))!;
  await click(button('編集',card()));const editedScores=[5000,5000,10000,80000];
  for(const [i,score] of editedScores.entries())await input(host.querySelector(`[aria-label="${i+1}人目の持ち点"]`)!,String(score));
  await click(button('計算結果を確認'));await click(button('この結果を保存'));
  const edited=selectedSampleRoom().state.games.find(game=>game.id===added.id)!;
  expect(edited.rows).toEqual(calculate(ids.map((playerId,i)=>({playerId,score:editedScores[i]})),original.rooms[0].state.rules));expect(edited.revisions).toHaveLength(1);
  assertDashboard(allTournamentState(loadSample().rooms));await click(button('直近の大会'));assertDashboard(recentTournament(loadSample().rooms)!.state);
  await remountSample();assertDashboard(recentTournament(loadSample().rooms)!.state);await click(button('対局履歴'));assertHistory(allTournamentState(loadSample().rooms));
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);await click(button('削除',card()));
  expect(selectedSampleRoom().state.games.some(game=>game.id===added.id)).toBe(false);assertHistory(allTournamentState(loadSample().rooms));
  await click(button('ダッシュボード'));assertDashboard(recentTournament(loadSample().rooms)!.state);await click(button('全大会・累計'));assertDashboard(allTournamentState(loadSample().rooms));
  await remountSample();assertDashboard(recentTournament(loadSample().rooms)!.state);await click(button('対局履歴'));assertHistory(allTournamentState(loadSample().rooms));
  expect(loadSample().rooms[1]).toEqual(original.rooms[1]);
  const saved=localStorage.getItem(SAMPLE_KEY);confirm.mockReturnValue(false);await click(button('サンプルデータをリセット'));expect(localStorage.getItem(SAMPLE_KEY)).toBe(saved);
  confirm.mockReturnValue(true);await click(button('サンプルデータをリセット'));expect(loadSample()).toEqual(freshSample());assertDashboard(recentTournament(loadSample().rooms)!.state);
  for(const [key,value] of Object.entries(canaries))expect(localStorage.getItem(key)).toBe(value);
  expect(createClient).not.toHaveBeenCalled();expect(network).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
});
it('repairs only the untouched old seed timestamp while retaining saved scores and storage bytes',()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-02T00:00:00Z'));
 try{const store=freshSample();const seedDay='2026-11-02';store.rooms=[0,1].map(index=>{const room=structuredClone(store.rooms[0]);room.id='sample-room-'+index;room.state.games=Array.from({length:index?4:8},(_,i)=>({...structuredClone(room.state.games[0]),id:'sample-game-'+index+'-'+i,round:i+1,playedOn:seedDay,date:seedDay+'T12:00:00.000Z'}));room.updated_at=seedDay+'T12:00:00.000Z';return room;});const untouched=store.rooms[1];untouched.updated_at=untouched.state.games[0].playedOn+'T12:00:00.000Z';untouched.state.games=untouched.state.games.map(game=>({...game,date:untouched.updated_at}));
  store.rooms[0]={...store.rooms[0],version:2,updated_at:new Date().toISOString()};store.rooms[0].state.name='編集済みの大会';saveSample(store);const raw=localStorage.getItem(SAMPLE_KEY);
  const loaded=loadSample();expect(loaded.rooms[0]).toEqual(store.rooms[0]);expect(loaded.rooms[1].state).toEqual(untouched.state);expect(Date.parse(loaded.rooms[1].updated_at)).toBeLessThan(Date.now());expect(recentTournament(loaded.rooms)?.id).toBe(store.rooms[0].id);expect(localStorage.getItem(SAMPLE_KEY)).toBe(raw);
 }finally{vi.useRealTimers();}
});
it('recovers from damaged sample storage with an explicit reset and allows saving again',async()=>{
 localStorage.setItem(SAMPLE_KEY,'broken');vi.spyOn(window,'confirm').mockReturnValue(true);await act(async()=>root.render(<App sample/>));expect(host.textContent).toContain('サンプルの保存データを読み込めません');
 await click(button('サンプルデータをリセット'));expect(host.textContent).not.toContain('サンプルの保存データを読み込めません');await click(button('スコア入力＋'));await click(button('計算結果を確認'));await click(button('この結果を保存'));expect(selectedSampleRoom().state.games).toHaveLength(1);expect(loadSample().rooms.flatMap(room=>room.state.games)).toHaveLength(2);
});
it('reuses the full score UI, saves and edits sample results locally, and leaves legacy storage/network untouched',async()=>{
 const legacy='legacy-data-must-survive';localStorage.setItem('janroku-v1',legacy);localStorage.setItem('janroku-local-history',legacy);
 const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('No network allowed'));
 await act(async()=>root.render(<App sample/>));
 expect(host.querySelector('.sample-banner')?.textContent).toContain('サンプル体験中');expect(host.querySelector('.ranking-panel')).not.toBeNull();
 expect(host.querySelector('.dashboard-home-link a')?.getAttribute('href')).toBe('#');
 await click(button('対局履歴'));expect(host.querySelectorAll('.history-card')).toHaveLength(1);expect(host.querySelector('.progress-panel')).not.toBeNull();
 await click(button('スコア入力＋'));await click(button('計算結果を確認'));await click(button('この結果を保存'));
 expect(selectedSampleRoom().state.games).toHaveLength(1);expect(loadSample().rooms.flatMap(room=>room.state.games)).toHaveLength(2);
 await click(button('対局履歴'));await click(button('編集',host.querySelector('.history-card')!));expect(host.querySelector('.score-panel h2')?.textContent).toBe('対局結果を編集');
 await click(button('計算結果を確認'));await click(button('この結果を保存'));expect(loadSample().rooms.flatMap(r=>r.state.games).flatMap(g=>g.revisions)).toHaveLength(1);
 await click(button('設定'));expect(host.querySelector('[aria-label="Supabase Project URL"]')).toBeNull();
 expect(createClient).not.toHaveBeenCalled();expect(network).not.toHaveBeenCalled();expect(localStorage.getItem('janroku-v1')).toBe(legacy);expect(localStorage.getItem('janroku-local-history')).toBe(legacy);
 expect(localStorage.getItem('janroku-device-id')).toBeNull();
});
it('resets only sample records and preserves existing local records and connection settings',()=>{
 localStorage.setItem('janroku-v1','keep-real-data');localStorage.setItem('janroku-cloud-config','keep-connection');
 const edited=freshSample();edited.rooms[0].state.name='変更済み';edited.rooms[0].state.games=[];saveSample(edited);
 saveSample(freshSample());expect(selectedSampleRoom().state.name).toBe(freshSample().rooms[0].state.name);expect(selectedSampleRoom().state.games).toHaveLength(1);
 expect(localStorage.getItem('janroku-v1')).toBe('keep-real-data');expect(localStorage.getItem('janroku-cloud-config')).toBe('keep-connection');
});
it('creates a sample tournament in local storage and reloads the selected tournament',async()=>{
 await act(async()=>root.render(<App sample/>));await click(button('大会管理'));
 await click(host.querySelector('.tournament-list-disclosure summary')!);
 await input(host.querySelector('[aria-label="新しい大会名"]')!,'おためし大会');await click(button('大会を作成'));
 const saved=loadSample();expect(saved.rooms).toHaveLength(2);expect(saved.rooms.find(r=>r.id===saved.selected)?.state.name).toBe('おためし大会');expect(host.querySelector('.score-tournament strong')?.textContent).toBe('おためし大会');
 expect(localStorage.getItem('janroku-v1')).toBeNull();expect(createClient).not.toHaveBeenCalled();
});
it('opens the participant input for the score tournament without changing any records',async()=>{
 await act(async()=>root.render(<App sample/>));await click(button('スコア入力＋'));const before=localStorage.getItem(SAMPLE_KEY);
 expect(button('参加者を追加する').compareDocumentPosition(button('計算結果を確認'))&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();await click(button('参加者を追加する'));expect(host.querySelector('h1')?.textContent).toBe('大会管理');expect(document.activeElement).toBe(host.querySelector('[aria-label="参加者名"]'));expect(host.querySelector<HTMLSelectElement>('[aria-label="参加者を管理する大会"]')?.value).toBe(loadSample().selected);expect(localStorage.getItem(SAMPLE_KEY)).toBe(before);
});
it('updates a new tournament name with its date, preserves manual edits and carries the date into score entry',async()=>{
 const existing=freshSample();existing.rooms[0].state.name='既存の大会';saveSample(existing);
 await act(async()=>root.render(<App sample/>));await click(button('大会管理'));await click(host.querySelector('.tournament-list-disclosure summary')!);
 const date=host.querySelector<HTMLInputElement>('[aria-label="新しい大会の対局日"]')!,name=host.querySelector<HTMLInputElement>('[aria-label="新しい大会名"]')!;
 await input(date,'2026-11-01');expect(name.value).toBe('2026/11/01（日）麻雀会');await input(date,'2026-11-02');expect(name.value).toBe('2026/11/02（月）麻雀会');
 await input(name,'仲間の大会');await input(date,'2026-11-03');expect(name.value).toBe('仲間の大会');await click(button('大会を作成'));
 expect(host.querySelector<HTMLInputElement>('[aria-label="対局日"]')?.value).toBe('2026-11-03');expect(host.querySelector<HTMLInputElement>('[aria-label="スコア入力の大会名"]')?.value).toBe('仲間の大会');
 await input(host.querySelector('[aria-label="対局日"]')!,'2026-11-04');expect(host.querySelector<HTMLInputElement>('[aria-label="スコア入力の大会名"]')?.value).toBe('仲間の大会');
});
it('auto-names a new empty tournament in score entry until manually edited, without changing stored names before save',async()=>{
 const existing=freshSample();existing.rooms[0].state.name='既存の大会';saveSample(existing);
 await act(async()=>root.render(<App sample/>));await click(button('大会管理'));await click(host.querySelector('.tournament-list-disclosure summary')!);await input(host.querySelector('[aria-label="新しい大会の対局日"]')!,'2026-11-01');await click(button('大会を作成'));
 await input(host.querySelector('[aria-label="対局日"]')!,'2026-11-02');expect(host.querySelector<HTMLInputElement>('[aria-label="スコア入力の大会名"]')?.value).toBe('2026/11/02（月）麻雀会');
 const saved=loadSample();expect(saved.rooms.find(r=>r.id===saved.selected)?.state.name).toBe('2026/11/01（日）麻雀会');
 await input(host.querySelector('[aria-label="スコア入力の大会名"]')!,'手動の名前');await input(host.querySelector('[aria-label="対局日"]')!,'2026-11-03');expect(host.querySelector<HTMLInputElement>('[aria-label="スコア入力の大会名"]')?.value).toBe('手動の名前');
});
it('preserves existing tournament names on date changes and saves an explicit name edit with the score',async()=>{
 const existing=freshSample();existing.rooms[0].id='custom-existing';existing.selected='custom-existing';saveSample(existing);
 await act(async()=>root.render(<App sample/>));await click(button('スコア入力＋'));await input(host.querySelector('[aria-label="対局日"]')!,'2026-11-02');expect(host.querySelector<HTMLInputElement>('[aria-label="スコア入力の大会名"]')?.value).toBe(freshSample().rooms[0].state.name);
 await input(host.querySelector('[aria-label="スコア入力の大会名"]')!,'手動で編集した大会');await click(button('計算結果を確認'));expect(host.querySelector('.confirm-tournament strong')?.textContent).toBe('手動で編集した大会');await click(button('この結果を保存'));expect(selectedSampleRoom().state.name).toBe('手動で編集した大会');
});
it('uses a circled suffix when another tournament on the same day is created',async()=>{
 const store=freshSample();store.rooms[0].state.name=tournamentName('2026-11-01');saveSample(store);await act(async()=>root.render(<App sample/>));await click(button('大会管理'));await click(host.querySelector('.tournament-list-disclosure summary')!);await input(host.querySelector('[aria-label="新しい大会の対局日"]')!,'2026-11-01');expect(host.querySelector<HTMLInputElement>('[aria-label="新しい大会名"]')?.value).toBe('2026/11/01（日）麻雀会②');await click(button('大会を作成'));expect(loadSample().rooms.at(-1)?.state.name).toBe('2026/11/01（日）麻雀会②');expect(loadSample().rooms[0].state.name).toBe(store.rooms[0].state.name);
});
it('initializes fictional data without writing storage and rejects damaged data rather than overwriting it',()=>{
 const sample=freshSample();expect(sample.rooms.flatMap(r=>r.state.games)).toHaveLength(1);expect(localStorage.getItem(SAMPLE_KEY)).toBeNull();
 localStorage.setItem(SAMPLE_KEY,'broken');expect(()=>loadSample()).toThrow();expect(localStorage.getItem(SAMPLE_KEY)).toBe('broken');
});
it.each([
 ['2026-11-02T00:01:00','2026-11-01','2026/11/01（日）麻雀会'],
 ['2027-01-01T09:00:00','2026-12-31','2026/12/31（木）麻雀会'],
 ['2026-03-01T09:00:00','2026-02-28','2026/02/28（土）麻雀会'],
 ['2024-03-01T09:00:00','2024-02-29','2024/02/29（木）麻雀会'],
])('seeds one game and four players on the previous local calendar day: %s',(date,day,name)=>{
 const now=new Date(date),sample=freshSample(now);expect(sample.rooms).toHaveLength(1);const room=sample.rooms[0];
 expect(room.state.name).toBe(name);expect(room.state.players).toHaveLength(4);expect(room.state.games).toHaveLength(1);const game=room.state.games[0];
 expect(game.playedOn).toBe(day);expect(game.rows).toHaveLength(4);expect(new Set(game.rows.map(row=>row.playerId)).size).toBe(4);expect(game.round).toBe(1);expect(Date.parse(game.date)).toBeLessThan(now.getTime());
 expect(game.rows).toEqual(calculate(room.state.players.map((player,i)=>({playerId:player.id,score:[42000,28000,19000,11000][i]})),room.state.rules));expect(localStorage.getItem(SAMPLE_KEY)).toBeNull();
});
it('offers the two landing actions without polling existing tournament data',async()=>{
 location.hash='';vi.useFakeTimers();
 localStorage.setItem('janroku-cloud-config',JSON.stringify({url:'https://test.supabase.co',key:'sb_publishable_test'}));
 const rpc=vi.fn(async()=>({data:{version:1},error:null}));vi.mocked(createClient).mockReturnValueOnce({rpc} as unknown as ReturnType<typeof createClient>);
 try{await act(async()=>root.render(<Landing/>));expect(host.querySelector('a[href="#sample"]')?.textContent).toContain('サンプルを体験する');expect(button('新しいグループを作成')).toBeTruthy();expect(host.querySelector('a[href="#legacy"]')).not.toBeNull();
 expect(host.querySelector<HTMLElement>('.landing-start')?.hidden).toBe(true);expect(host.querySelector('[aria-label="新しい雀録のグループ名"]')).toBeNull();
 await click(button('新しいグループを作成'));expect(host.querySelector<HTMLElement>('.landing-start')?.hidden).toBe(false);expect(host.querySelector('[aria-label="新しい雀録のグループ名"]')).not.toBeNull();
 expect(rpc.mock.calls).toHaveLength(1);await click(button('グループ作成を閉じる'));expect(host.querySelector<HTMLElement>('.landing-start')?.hidden).toBe(true);
 await act(async()=>vi.advanceTimersByTimeAsync(60000));expect(rpc.mock.calls).toHaveLength(1);}finally{vi.useRealTimers();}
});
