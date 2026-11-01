import {type State,type Game,gameDay} from './domain';
export type EntityChange={kind:'game'|'player'|'settings'|'archive';id:string;before:unknown;after:unknown};
export type PublicOperation={changes:EntityChange[]}|{restore:string};
export function stableJSON(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(stableJSON).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stableJSON(v)).join(',')+'}';
 return JSON.stringify(value)??'null';
}
export function stateChanges(before:State,after:State,original?:Game|null,targetGameId?:string):EntityChange[]{
 const changes:EntityChange[]=[];
 for(const [field,kind] of [['players','player'],['games','game']] as const){
  const a=new Map(before[field].map(p=>[p.id,p])),b=new Map(after[field].map(p=>[p.id,p]));
  for(const id of new Set([...a.keys(),...b.keys()])){
   const old=a.get(id)??null,next=b.get(id)??null;
   if(stableJSON(old)!==stableJSON(next))changes.push({kind,id,before:kind==='game'&&(targetGameId===id||original?.id===id)?original??null:old,after:next});
  }
 }
 const a={name:before.name,rules:before.rules},b={name:after.name,rules:after.rules};
 if(stableJSON(a)!==stableJSON(b))changes.push({kind:'settings',id:'settings',before:a,after:b});
 return changes;
}
export function gameRound(games:Game[],game:Game):number{
 if(game.round)return game.round;
 let n=0;for(const g of games){if(g.table===game.table&&gameDay(g)===gameDay(game))n++;if(g.id===game.id)return n;}
 return n+1;
}
export function nextRound(games:Game[],day:string,table:string):number{return 1+Math.max(0,...games.filter(g=>gameDay(g)===day&&g.table===table).map(g=>gameRound(games,g)));}
