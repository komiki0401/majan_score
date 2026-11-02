// @vitest-environment jsdom
import {describe,it,expect} from 'vitest';
import {groupAccess,newGroupToken,groupShareURL,groupRPC,shortGroupRoute,shortGroupURL,entryRoute} from './group-sharing';
describe('group capability URLs',()=>{
 it('keeps short reading links separate from edit capabilities and routes admin separately',()=>{
  const id='a7K9m2Ab_cD-1234',token='a'.repeat(64),room='11111111-1111-4111-8111-111111111111';
  const view=new URL(shortGroupURL(id,room));expect(view.search).toBe('');expect(view.hash).not.toMatch(/key|project|edit/);expect(groupAccess(view.hash)).toEqual({mode:true,token:null});expect(shortGroupRoute(view.hash)).toEqual({shortId:id,roomId:room,editorToken:null});
  const edit=new URL(shortGroupURL(id,room,token));expect(shortGroupRoute(edit.hash)?.editorToken).toBe(token);expect(groupAccess(edit.hash).token).toBe(token);expect(entryRoute(view.hash)).toBe('workspace');expect(entryRoute('#/admin')).toBe('admin');
  for(const hash of ['#/g/short','#/g/'+id+'/extra','#/g/'+id+'?edit=invalid'])expect(groupAccess(hash)).toEqual({mode:true,token:null});expect(shortGroupRoute('#/g/short')).toBeNull();expect(()=>shortGroupURL('short')).toThrow();
 });
 it('generates 256-bit URLs without server credentials and restores the scope',()=>{const token=newGroupToken(),other=newGroupToken();expect(token).toMatch(/^[a-f0-9]{64}$/);expect(token).not.toBe(other);const url=new URL(groupShareURL(token,'room-id'));expect(groupAccess(url.hash)).toEqual({mode:true,token});expect(url.search).toBe('');expect(url.hash).not.toContain('key=');expect(new URLSearchParams(url.hash.slice(1)).get('room')).toBe('room-id');});
 it('fails closed on malformed group links instead of falling back to public data',()=>{for(const hash of ['#group=','#group=bad','#group='+('a'.repeat(63))])expect(groupAccess(hash)).toEqual({mode:true,token:null});expect(groupAccess('#room=old')).toEqual({mode:false,token:null});});
 it('routes every existing mutation and read to the group engine only in group mode',()=>{for(const name of ['jr_public_list','jr_public_room','jr_public_apply']){expect(groupRPC(name,true)).toBe(name.replace('public','group'));expect(groupRPC(name,false)).toBe(name);}expect(groupRPC('jr_public_create',true)).toBe('jr_group_tournament_create');});
});
