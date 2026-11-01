// @vitest-environment jsdom
import {describe,it,expect} from 'vitest';
import {groupAccess,newGroupToken,groupShareURL,groupRPC} from './group-sharing';
describe('group capability URLs',()=>{
 it('generates 256-bit URLs without server credentials and restores the scope',()=>{const token=newGroupToken(),other=newGroupToken();expect(token).toMatch(/^[a-f0-9]{64}$/);expect(token).not.toBe(other);const url=new URL(groupShareURL(token,'room-id'));expect(groupAccess(url.hash)).toEqual({mode:true,token});expect(url.search).toBe('');expect(url.hash).not.toContain('key=');expect(new URLSearchParams(url.hash.slice(1)).get('room')).toBe('room-id');});
 it('fails closed on malformed group links instead of falling back to public data',()=>{for(const hash of ['#group=','#group=bad','#group='+('a'.repeat(63))])expect(groupAccess(hash)).toEqual({mode:true,token:null});expect(groupAccess('#room=old')).toEqual({mode:false,token:null});});
 it('routes every existing mutation and read to the group engine only in group mode',()=>{for(const name of ['jr_public_list','jr_public_room','jr_public_apply']){expect(groupRPC(name,true)).toBe(name.replace('public','group'));expect(groupRPC(name,false)).toBe(name);}expect(groupRPC('jr_public_create',true)).toBe('jr_group_tournament_create');});
});
