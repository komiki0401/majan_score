import {describe,it,expect} from 'vitest';
import {calculate,fromPoints,standings,defaultRules,csv,emptyState} from './domain';
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
