export type Rules = { start:number; returnScore:number; uma:number[]; oka:boolean; okaWeights:number[]; tie:'split'|'seat'; rounding:'none'|'round'|'floor' };
export const defaultRules:Rules={start:25000,returnScore:30000,uma:[20,10,-10,-20],oka:true,okaWeights:[1,0,0,0],tie:'split',rounding:'none'};
export type Row={playerId:string;score:number;rank:number;point:number;seat?:number};
export type Game={id:string;table:string;date:string;rows:Row[];rules:Rules;revisions:{date:string;rows:Row[];rules:Rules}[]};
export type Player={id:string;name:string};
export type State={version:1;name:string;players:Player[];games:Game[];rules:Rules};
export const emptyState:State={version:1,name:'週末のセット麻雀',players:[],games:[],rules:defaultRules};
export function calculate(inputs:{playerId:string;score:number}[],r:Rules):Row[]{
 if(inputs.length!==4||new Set(inputs.map(x=>x.playerId)).size!==4||inputs.some(x=>!x.playerId||!Number.isSafeInteger(x.score)||Math.abs(x.score)>1000000))throw Error('異なる4人と有効な整数の点数を入力してください。');
 if(!Number.isSafeInteger(r.start)||r.start<=0||!Number.isSafeInteger(r.returnScore)||r.returnScore<=0||r.uma.length!==4||r.okaWeights.length!==4||[...r.uma,...r.okaWeights].some(x=>!Number.isFinite(x))||r.okaWeights.some(x=>x<0)||Math.abs(r.okaWeights.reduce((a,b)=>a+b,0)-1)>1e-8)throw Error('ルール設定を確認してください。オカ配分の合計は100%です。');
 if(inputs.reduce((a,x)=>a+x.score,0)!==r.start*4)throw Error(`持ち点合計を ${(r.start*4).toLocaleString()} 点に合わせてください。`);
 const sorted=inputs.map((x,i)=>({...x,seat:i})).sort((a,b)=>b.score-a.score||a.seat-b.seat);
 const bonus=r.uma.map((x,i)=>x+(r.oka?(r.returnScore-r.start)*4/1000*r.okaWeights[i]:0));
 return sorted.map((x,i)=>{const first=sorted.findIndex(y=>y.score===x.score),count=sorted.filter(y=>y.score===x.score).length;const b=r.tie==='split'?bonus.slice(first,first+count).reduce((a,b)=>a+b,0)/count:bonus[i];let point=(x.score-r.returnScore)/1000+b;if(r.rounding==='round')point=Math.round(point);if(r.rounding==='floor')point=Math.floor(point);return {playerId:x.playerId,score:x.score,seat:x.seat,rank:r.tie==='split'?first+1:i+1,point:Math.round(point*10000)/10000};});
}
export function standings(state:State){return state.players.map(p=>{const rows=state.games.flatMap(g=>g.rows.filter(r=>r.playerId===p.id));return {...p,count:rows.length,total:rows.reduce((a,x)=>a+x.point,0),average:rows.length?rows.reduce((a,x)=>a+x.rank,0)/rows.length:0,ranks:[1,2,3,4].map(n=>rows.filter(x=>x.rank===n).length)};}).sort((a,b)=>b.total-a.total);}
export interface Repository{load():State;save(state:State):void}
export const repository:Repository={load(){const raw=localStorage.getItem('janroku-v1');if(!raw)return structuredClone(emptyState);const s=JSON.parse(raw);if(s.version!==1||!Array.isArray(s.players)||!Array.isArray(s.games)||!s.rules)throw Error('保存データの形式を読み取れません。');return s;},save(s){localStorage.setItem('janroku-v1',JSON.stringify(s));}};
export function csv(state:State){const cell=(v:unknown)=>{let s=String(v);if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};return '\uFEFF'+[['日時','卓','参加者','持ち点','順位','ポイント'],...state.games.flatMap(g=>g.rows.map(r=>[g.date,g.table,state.players.find(p=>p.id===r.playerId)?.name??'不明',r.score,r.rank,r.point]))].map(r=>r.map(cell).join(',')).join('\r\n');}
