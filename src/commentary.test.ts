import {describe,it,expect} from 'vitest';
import {commentaryLines,liveCommentary} from './commentary';
import {emptyState,defaultRules,type State} from './domain';
import {commentaryPhrases} from './commentary-phrases';
const fixture=():State=>({...structuredClone(emptyState),players:['トップ','二番','三番','四番'].map((name,i)=>({id:String(i),name})),games:[{id:'one',date:'2026-05-05',table:'1',rules:defaultRules,revisions:[],rows:[100,5,4,-109].map((point,i)=>({playerId:String(i),point,score:25000,rank:i+1,seat:i}))}]});
describe('commentary for all positions',()=>{
 it('contains 720 original scripts and at least twenty times the previous ordinary rotation',()=>{
  const scripts=Object.values(commentaryPhrases).flat();expect(scripts).toHaveLength(720);expect(new Set(scripts).size).toBe(720);
  expect(commentaryLines(structuredClone(emptyState)).length).toBeGreaterThanOrEqual(80);expect(commentaryLines(fixture()).length).toBeGreaterThanOrEqual(240);
  for(const line of commentaryLines(fixture()))expect(line).not.toMatch(/\{\w+\}|undefined|NaN/);
 });
 it('uses only relevant gap commentary and does not call tied leaders chasers',()=>{
  const near=fixture();near.games[0].rows=near.games[0].rows.map((row,i)=>({...row,point:[10,5,0,-15][i]}));
  expect(commentaryLines(near).some(line=>line.includes('先頭争いが引き締まっています'))).toBe(true);expect(commentaryLines(near).some(line=>line.includes('大きなリードが数字に出ています'))).toBe(false);
  expect(commentaryLines(fixture()).some(line=>line.includes('大きなリードが数字に出ています'))).toBe(true);
  const tied=fixture();tied.games[0].rows=tied.games[0].rows.map(row=>({...row,point:0,rank:1}));const lines=commentaryLines(tied);
  expect(lines.some(line=>line.includes('同率トップ'))).toBe(true);expect(lines.some(line=>/2位から追走|ダントツ|僅差で|大きなリード|が追いかける|ここからの巻き返し/.test(line))).toBe(false);
  expect(lines.some(line=>/\{\w+\}|undefined|NaN/.test(line))).toBe(false);
 });
 it('keeps solo messages factual and counts an actual rank improvement instead of tied sort order',()=>{
  const solo=fixture();solo.games[0].rows=solo.games[0].rows.slice(0,1);const soloLines=commentaryLines(solo);expect(soloLines.length).toBeGreaterThanOrEqual(60);expect(soloLines.some(line=>line.includes('2位'))).toBe(false);
  const s=fixture();s.games[0].rows=s.games[0].rows.map((row,i)=>({...row,point:[10,5,5,0][i]}));s.games.push({...structuredClone(s.games[0]),id:'next',date:'2026-05-06',rows:s.games[0].rows.map((row,i)=>({...row,point:[-10,15,0,0][i]}))});
  expect(commentaryLines(s).some(line=>line.includes('三番さんが順位を上げ'))).toBe(false);
 });
 it('provides distinct opening messages and a broader factual rotation',()=>{const opening=commentaryLines(structuredClone(emptyState));expect(opening.length).toBeGreaterThanOrEqual(4);const s=fixture(),lines=commentaryLines(s);expect(lines.length).toBeGreaterThanOrEqual(12);expect(new Set(lines).size).toBe(lines.length);expect(lines.some(line=>line.includes('トップさんがトップ回数1回で最多'))).toBe(true);expect(lines.some(line=>line.includes('ここまで1半荘、4人'))).toBe(true);expect(lines.some(line=>line.includes('連続トップ'))).toBe(false);});
 it('counts consecutive wins only across the player own appearances',()=>{const s=fixture();s.games.push({...s.games[0],id:'skip',date:'2026-05-06',rows:s.games[0].rows.filter(row=>row.playerId!=='0')},{...s.games[0],id:'next',date:'2026-05-07'});expect(commentaryLines(s).some(line=>line.includes('トップさんは自身の直近2対局で連続トップ'))).toBe(true);});
 it('includes a close contest outside first place and a positive comeback comment',()=>{const s=fixture(),original=structuredClone(s),lines=commentaryLines(s);expect(lines.some(line=>line.includes('二番さんと三番さんが接戦'))).toBe(true);expect(lines.some(line=>line.includes('四番さん')&&line.includes('巻き返し'))).toBe(true);expect(liveCommentary(s,1)).not.toBe(liveCommentary(s));expect(liveCommentary(s,lines.length)).toBe(liveCommentary(s));expect(s).toEqual(original);});
 it('notices a latest half-game win by a player who is not overall leader',()=>{const s=fixture();s.games.push({...s.games[0],id:'two',date:'2026-05-06',rows:s.games[0].rows.map((r,i)=>({...r,rank:[4,1,2,3][i],point:[-10,20,0,-10][i]}))});expect(commentaryLines(s).some(line=>line.includes('二番さんが直近の半荘でトップ'))).toBe(true);});
});
