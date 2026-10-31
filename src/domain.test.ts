import {describe,it,expect} from 'vitest';
import {calculate,defaultRules,csv,emptyState} from './domain';
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
