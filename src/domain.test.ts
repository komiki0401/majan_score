import {describe,it,expect} from 'vitest';
import {calculate,fromPoints,standings,orderedGames,pointProgress,rankProgress,gameDay,forDay,localDay,validDay,defaultRules,csv,emptyState} from './domain';
const input=(scores:number[])=>scores.map((score,i)=>({playerId:String(i),score}));
describe('score calculation',()=>{
 it('calculates rank, uma and oka with zero sum',()=>{const rows=calculate(input([40000,30000,20000,10000]),defaultRules);expect(rows.map(x=>x.point)).toEqual([50,10,-20,-40]);expect(rows.reduce((a,x)=>a+x.point,0)).toBe(0);});
 it('splits tied bonuses',()=>{expect(calculate(input([35000,35000,15000,15000]),defaultRules).map(x=>[x.rank,x.point])).toEqual([[1,30],[1,30],[3,-30],[3,-30]]);});
 it('uses input seat order for ties',()=>{expect(calculate(input([25000,25000,25000,25000]),{...defaultRules,tie:'seat'}).map(x=>x.point)).toEqual([35,5,-15,-25]);});
 it('supports decimal and negative floor',()=>{const r=calculate(input([33333,27777,22222,16668]),{...defaultRules,rounding:'floor'});expect(r[0].point).toBe(43);expect(r[3].point).toBe(-34);});
 it('rejects totals, duplicate players and fractions',()=>{expect(()=>calculate(input([1,2,3,4]),defaultRules)).toThrow();expect(()=>calculate(input([25000.5,24999.5,25000,25000]),defaultRules)).toThrow();expect(()=>calculate(input([25000,25000,25000,25000]).map(x=>({...x,playerId:'a'})),defaultRules)).toThrow();});
 it('supports custom oka allocation and disabled oka',()=>{expect(calculate(input([40000,30000,20000,10000]),{...defaultRules,okaWeights:[.5,.5,0,0]})[0].point).toBe(40);expect(calculate(input([40000,30000,20000,10000]),{...defaultRules,oka:false})[0].point).toBe(30);});
 it('escapes spreadsheet formula injection',()=>expect(csv({...emptyState,players:[{id:'0',name:'=HYPERLINK("x")'}],games:[{id:'a',table:'1',date:'today',rules:defaultRules,revisions:[],rows:[{playerId:'0',score:25000,rank:1,point:35}]}]})).toContain("'=HYPERLINK"));
});

describe('direct half-game points',()=>{
 it('keeps points without applying uma or oka again',()=>{const rows=fromPoints([50,10,-20,-40].map((point,i)=>({playerId:String(i),point,rank:i+1})),defaultRules);expect(rows.map(x=>x.point)).toEqual([50,10,-20,-40]);expect(rows.every(x=>x.score===null)).toBe(true);});
 it('preserves explicit ranks even when custom bonuses reverse point order',()=>{const rows=fromPoints([-20,50,10,-40].map((point,i)=>({playerId:String(i),point,rank:i+1})),defaultRules);expect(rows.map(x=>x.playerId)).toEqual(['0','1','2','3']);});
 it('allows decimals, negatives, zero, nonzero totals and split ties',()=>{const rows=fromPoints([1.2345,0,-3.2,-3.2].map((point,i)=>({playerId:String(i),point,rank:[1,2,3,3][i]})),defaultRules);expect(rows.map(x=>x.point)).toEqual([1.2345,0,-3.2,-3.2]);});
 it('rejects invalid input and impossible rankings',()=>{const data=[50,10,-20,-40].map((point,i)=>({playerId:String(i),point,rank:i+1}));for(const point of [NaN,Infinity,0.12345,1000001])expect(()=>fromPoints(data.map((x,i)=>i===0?{...x,point}:x),defaultRules)).toThrow();expect(()=>fromPoints(data.map(x=>({...x,playerId:'same'})),defaultRules)).toThrow();expect(()=>fromPoints(data.map((x,i)=>({...x,rank:[1,1,2,4][i]})),defaultRules)).toThrow();expect(()=>fromPoints(data.map((x,i)=>({...x,rank:[1,1,3,4][i]})),{...defaultRules,tie:'seat'})).toThrow();});
 it('aggregates score and points entries and exports missing scores as empty',()=>{const rows=fromPoints([1,2,3,4].map((point,i)=>({playerId:String(i),point,rank:i+1})),defaultRules);const state={...emptyState,players:[{id:'0',name:'田中'}],games:[{id:'a',table:'1',date:'today',rules:defaultRules,revisions:[],rows:calculate(input([40000,30000,20000,10000]),defaultRules)},{id:'b',table:'1',date:'today',rules:defaultRules,revisions:[],rows}]};expect(standings(state)[0].total).toBe(51);expect(csv(state)).toContain('"田中","","1","1"');});
});


describe('daily results',()=>{
 const rows=calculate(input([40000,30000,20000,10000]),defaultRules);
 const state={...emptyState,players:[{id:'0',name:'田中'}],games:[{id:'may',table:'1',date:'2026-05-05T01:00:00Z',playedOn:'2026-05-05',rules:defaultRules,revisions:[],rows},{id:'june',table:'1',date:'2026-06-07T01:00:00Z',playedOn:'2026-06-07',rules:defaultRules,revisions:[],rows:rows.map(r=>({...r,point:r.point*2}))}]};
 it('isolates daily totals and supports all-time totals',()=>{expect(standings(forDay(state,'2026-05-05'))[0].total).toBe(50);expect(standings(forDay(state,'2026-06-07'))[0].total).toBe(100);expect(standings(forDay(state,'all'))[0].total).toBe(150);expect(forDay(state,'2026-07-01').games).toEqual([]);expect(state.games).toHaveLength(2);});
 it('honors the explicit played date independently of timestamp',()=>{expect(gameDay({...state.games[0],date:'2026-10-31T23:59:00Z'})).toBe('2026-05-05');});
 it('reads old games without a played date using the local calendar',()=>{const {playedOn,...legacy}=state.games[0];expect(gameDay(legacy)).toBe(localDay(new Date(legacy.date)));});
 it('validates dates including leap days and impossible dates',()=>{expect(validDay('2024-02-29')).toBe(true);for(const d of ['','2026-02-29','2026-04-31','2026-5-5','1899-12-31','bad'])expect(validDay(d)).toBe(false);});
 it('exports only selected games and includes the played date',()=>{const output=csv(forDay(state,'2026-05-05'));expect(output).toContain('対局日');expect(output).toContain('2026-05-05');expect(output).not.toContain('2026-06-07');});
});


describe('point progress',()=>{
 const players=[{id:'a',name:'田中'},{id:'b',name:'佐藤'},{id:'c',name:'未参加'}];
 const game=(id:string,playedOn:string,rows:{playerId:string;point:number}[])=>({id,playedOn,date:'2026-11-01T00:00:00Z',table:'1',rules:defaultRules,revisions:[],rows:rows.map((r,i)=>({...r,score:null,rank:i+1}))});
 const state={...emptyState,players,games:[game('june','2026-06-07',[{playerId:'b',point:-3}]),game('may1','2026-05-05',[{playerId:'a',point:10.1234}]),game('may2','2026-05-05',[{playerId:'a',point:-5.1234},{playerId:'b',point:0}])]};
 it('orders by play date while retaining same-day recording order',()=>{expect(orderedGames(state).map(g=>g.id)).toEqual(['may1','may2','june']);expect(state.games[0].id).toBe('june');});
 it('starts at zero, accumulates exact decimals and carries absent players forward',()=>{const {series}=pointProgress(state);expect(series.map(p=>p.id)).toEqual(['a','b']);expect(series[0].values).toEqual([0,10.1234,5,5]);expect(series[1].values).toEqual([0,0,0,-3]);});
 it('resets the selected day to zero and matches final rankings',()=>{const day=forDay(state,'2026-06-07');expect(pointProgress(day).series[0].values).toEqual([0,-3]);for(const p of pointProgress(state).series)expect(p.values.at(-1)).toBe(standings(state).find(r=>r.id===p.id)?.total);});
 it('handles empty results',()=>expect(pointProgress({...state,games:[]})).toEqual({games:[],series:[]}));
});


describe('rank progress',()=>{
 const players=[{id:'a',name:'田中'},{id:'b',name:'佐藤'}];
 const game=(id:string,playedOn:string,rows:{playerId:string;rank:number;point:number}[])=>({id,playedOn,date:playedOn+'T01:00:00Z',table:'1',rules:defaultRules,revisions:[],rows:rows.map(r=>({...r,score:null}))});
 const state={...emptyState,players,games:[game('june','2026-06-07',[{playerId:'a',rank:4,point:100}]),game('may','2026-05-05',[{playerId:'a',rank:1,point:-20},{playerId:'b',rank:1,point:10}])]};
 it('uses recorded half-game ranks, with ties and missing entries',()=>{expect(rankProgress(state).series.map(p=>p.values)).toEqual([[1,4],[1,null]]);});
 it('respects date filters and has no imaginary starting rank',()=>{expect(rankProgress(forDay(state,'2026-06-07')).series.map(p=>p.values)).toEqual([[4]]);expect(rankProgress({...state,games:[]})).toEqual({games:[],series:[]});});
});
