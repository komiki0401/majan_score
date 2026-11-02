// @vitest-environment jsdom
import {beforeEach,it,expect,vi} from 'vitest';
import {issueShortLink,rememberEditor,storedEditor} from './short-links';
import type {SupabaseClient} from '@supabase/supabase-js';
const id='a7K9m2Ab_cD-1234',token='a'.repeat(64),config={url:'https://test.supabase.co',key:'sb_publishable_test'};
beforeEach(()=>localStorage.clear());
it('isolates remembered editing by project and group and refuses malformed keys',()=>{
 expect(rememberEditor(config.url,id,token)).toBe(true);expect(storedEditor(config.url,id)).toBe(token);expect(storedEditor('https://other.supabase.co',id)).toBeNull();expect(storedEditor(config.url,'b'.repeat(16))).toBeNull();expect(rememberEditor(config.url,id,'invalid')).toBe(false);
 const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('blocked');});try{expect(rememberEditor(config.url,id,token)).toBe(false);}finally{spy.mockRestore();}
});
it('falls back only for a missing migration and never hides a permission or network failure',async()=>{
 const rpc=vi.fn().mockResolvedValue({data:{short_id:id},error:null}),client={rpc} as unknown as SupabaseClient;
 expect(await issueShortLink(config,token,client)).toBe(id);expect(storedEditor(config.url,id)).toBe(token);
 rpc.mockResolvedValue({data:null,error:{code:'PGRST202'}});expect(await issueShortLink(config,token,client)).toBeNull();rpc.mockResolvedValue({data:null,error:{code:'42501'}});await expect(issueShortLink(config,token,client)).rejects.toThrow('短縮URL');
});
