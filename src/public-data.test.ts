import {describe,it,expect} from 'vitest';
import {stateChanges,stableJSON,gameRound,nextRound} from './public-data';
import {liveCommentary} from './commentary';
import {emptyState,defaultRules,calculate,type State,type Game} from './domain';
const game=(id:string,scores=[40000,30000,20000,10000]):Game=>({id,table:'1',date:'2026-11-01T01:00:00Z',playedOn:'2026-11-01',rules:structuredClone(defaultRules),rows:calculate(scores.map((score,i)=>({playerId:String(i),score})),defaultRules),revisions:[]});
const state=():State=>({...structuredClone(emptyState),players:[0,1,2,3].map(i=>({id:String(i),name:['田中','佐藤','鈴木','高橋'][i]})),games:[game('a')]});
describe('public operation construction',()=>{
 it('changes only edited entities, leaving unrelated games untouched',()=>{const before=state();const after={...before,games:[...before.games,game('b')]};expect(stateChanges(before,after)).toEqual([{kind:'game',id:'b',before:null,after:after.games[1]}]);expect(before.games).toHaveLength(1);});
 it('uses the original edited record for conflict checks even after a realtime update',()=>{const original=game('a');const realtime={...state(),games:[{...original,table:'2'}]};const after={...realtime,games:[{...original,table:'3'}]};expect(stateChanges(realtime,after,original)[0].before).toEqual(original);});
 it('never turns a new-game retry into an implicit overwrite of a peer edit',()=>{const existing=state();const draft={...existing.games[0],table:'3'};const changes=stateChanges(existing,{...existing,games:[draft]},null,draft.id);expect(changes[0].before).toBeNull();});
 it('represents bulk deletion as individual reversible changes',()=>{const before=state();expect(stateChanges(before,{...before,games:[]})).toEqual([{kind:'game',id:'a',before:before.games[0],after:null}]);});
 it('ignores object key order but distinguishes array order and settings updates',()=>{expect(stableJSON({b:1,a:2})).toBe(stableJSON({a:2,b:1}));expect(stableJSON([1,2])).not.toBe(stableJSON([2,1]));const before=state();expect(stateChanges(before,{...before,name:'大会B'})[0].kind).toBe('settings');});
 it('assigns rounds separately per date/table and respects restored rounds',()=>{const games=[game('a'),{...game('b'),round:4}, {...game('c'),table:'2',round:9}];expect(gameRound(games,games[0])).toBe(1);expect(nextRound(games,'2026-11-01','1')).toBe(5);expect(nextRound(games,'2026-11-01','2')).toBe(10);expect(nextRound(games,'2026-11-02','1')).toBe(1);});
});
describe('live table commentary',()=>{
 it('welcomes an empty table without inventing a leader',()=>expect(liveCommentary(emptyState)).toContain('全員が優勝候補'));
 it('adds a playful comment for a runaway leader',()=>{const s=state();s.games=[game('a',[50000,20000,20000,10000])];expect(liveCommentary(s)).toContain('田中さんがダントツトップ');expect(liveCommentary(s)).toContain('プロなのかぁ');});
 it('recognizes tied leaders and close results',()=>{const s=state();s.games=[game('a',[35000,35000,15000,15000])];expect(liveCommentary(s)).toContain('田中さんと佐藤さんが同率トップ');const tied=s.games[0];s.games=[{...tied,rows:tied.rows.map((r,i)=>({...r,point:[5,4,-4,-5][i]}))}];expect(liveCommentary(s)).toContain('僅差');});
 it('recognizes an actual change in leader',()=>{const s=state();s.games.push({...game('b'),rows:game('b').rows.map((r,i)=>({...r,point:[-70,70,0,0][i]}))});expect(liveCommentary(s)).toContain('佐藤さんが首位に浮上');});
});
