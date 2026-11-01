import {beforeEach,expect,it,vi} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import {prepareGroupTournament} from './group-initial-tournament';
import {emptyState} from './domain';
vi.mock('@supabase/supabase-js',()=>({createClient:vi.fn()}));
const config={url:'https://test.supabase.co',key:'sb_publishable_test'};
beforeEach(()=>vi.clearAllMocks());
it('uses the new capability to name only the untouched initial room and keeps group identity separate',async()=>{
 const rpc=vi.fn().mockResolvedValueOnce({data:{id:'room',version:1,deleted_at:null,state:{...emptyState,name:'仲間'}},error:null}).mockResolvedValueOnce({data:{state:emptyState},error:null});vi.mocked(createClient).mockReturnValue({rpc} as unknown as ReturnType<typeof createClient>);
 await prepareGroupTournament(config,'new-token','room','仲間','2026/11/01（日）麻雀会','retry-id');expect(vi.mocked(createClient).mock.calls[0][2]?.global?.headers).toEqual({'x-janroku-group':'new-token'});expect(rpc.mock.calls[1][0]).toBe('jr_group_apply');expect(rpc.mock.calls[1][1].operation.changes[0].after.name).toBe('2026/11/01（日）麻雀会');
});
it('does not rename an existing or already edited tournament on retry',async()=>{
 const rpc=vi.fn().mockResolvedValue({data:{id:'room',version:2,deleted_at:null,state:{...emptyState,name:'手動の大会名'}},error:null});vi.mocked(createClient).mockReturnValue({rpc} as unknown as ReturnType<typeof createClient>);await prepareGroupTournament(config,'token','room','仲間','default','retry');expect(rpc).toHaveBeenCalledTimes(1);
});
it('reports incomplete initialization so the same creation can be retried',async()=>{
 const rpc=vi.fn().mockResolvedValue({data:null,error:{message:'offline'}});vi.mocked(createClient).mockReturnValue({rpc} as unknown as ReturnType<typeof createClient>);await expect(prepareGroupTournament(config,'token','room','仲間','default','retry')).rejects.toThrow('同じグループ名');
});
