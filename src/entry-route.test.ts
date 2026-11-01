import {expect,it} from 'vitest';
import {entryRoute} from './group-sharing';
it('opens existing dedicated and public URLs directly while separating the landing and sample',()=>{
 expect(entryRoute('')).toBe('landing');expect(entryRoute('#')).toBe('landing');expect(entryRoute('#sample')).toBe('sample');expect(entryRoute('#legacy')).toBe('workspace');
 expect(entryRoute('#group='+('a'.repeat(64))+'&room=existing')).toBe('workspace');expect(entryRoute('#group=invalid')).toBe('workspace');expect(entryRoute('#room=existing')).toBe('workspace');expect(entryRoute('#project=existing&key=public')).toBe('workspace');
});
