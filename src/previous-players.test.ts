import {describe,it,expect} from 'vitest';
import {previousPlayerNames,addPreviousPlayers} from './previous-players';
import {emptyState} from './domain';
describe('previous participants',()=>{
 it('collects every name across sources and skips duplicate names and existing participants',()=>{const state={...structuredClone(emptyState),players:[{id:'original',name:'田中'}]};const other={...state,players:[{id:'different',name:' 田中 '},{id:'old',name:'佐藤'}]};const original=structuredClone(state);const next=addPreviousPlayers(state,previousPlayerNames([state,other,other]));expect(next.players.map(p=>p.name)).toEqual(['田中','佐藤']);expect(next.players[0].id).toBe('original');expect(next.players[1].id).not.toBe('old');expect(addPreviousPlayers(next,previousPlayerNames([other])).players).toEqual(next.players);expect(state).toEqual(original);expect(next.games).toEqual(state.games);});
 it('rejects the entire batch if it exceeds the existing cloud participant limit',()=>{const state={...structuredClone(emptyState),players:Array.from({length:100},(_,i)=>({id:String(i),name:String(i)}))};expect(()=>addPreviousPlayers(state,['追加'])).toThrow('100人');expect(state.players).toHaveLength(100);});
});
