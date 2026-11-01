import {type State} from './domain';
/** Names are shared across tournaments; IDs always belong to the destination. */
export function previousPlayerNames(states:State[]):string[]{
 return [...new Set(states.flatMap(state=>state.players.map(player=>player.name.trim())).filter(name=>name.length>0&&name.length<=30))].sort((a,b)=>a.localeCompare(b,'ja'));
}
export function addPreviousPlayers(state:State,names:string[]):State{
 const existing=new Set(state.players.map(player=>player.name.trim()));
 const missing=previousPlayerNames([{...state,players:names.map(name=>({id:'',name}))}]).filter(name=>!existing.has(name));
 if(state.players.length+missing.length>100)throw Error('参加者は1大会100人までです。全員を追加すると上限を超えるため、個別に追加してください。');
 return {...state,players:[...state.players,...missing.map(name=>({id:crypto.randomUUID(),name}))]};
}
