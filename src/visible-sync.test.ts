// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {visibleSync} from './visible-sync';
let visibility='visible';
beforeEach(()=>{vi.useFakeTimers();visibility='visible';vi.spyOn(document,'visibilityState','get').mockImplementation(()=>visibility as DocumentVisibilityState);});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
it('stops all scheduled requests while hidden and resumes once on foreground',async()=>{
 const read=vi.fn(async()=>{}),sync=visibleSync(read);
 await vi.advanceTimersByTimeAsync(45000);expect(read).toHaveBeenCalledTimes(4);
 visibility='hidden';document.dispatchEvent(new Event('visibilitychange'));
 await vi.advanceTimersByTimeAsync(120000);expect(read).toHaveBeenCalledTimes(4);
 visibility='visible';document.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(0);expect(read).toHaveBeenCalledTimes(5);
 sync.stop();await vi.advanceTimersByTimeAsync(30000);expect(read).toHaveBeenCalledTimes(5);
});
it('coalesces simultaneous triggers without overlapping in-flight requests',async()=>{
 let finish=()=>{};const read=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));const sync=visibleSync(read);
 void sync.run();void sync.run();await vi.advanceTimersByTimeAsync(60000);expect(read).toHaveBeenCalledTimes(1);
 finish();await vi.advanceTimersByTimeAsync(0);expect(read).toHaveBeenCalledTimes(2);sync.stop();finish();
});
it('makes no requests offline and resumes when connectivity returns',async()=>{
 let online=false;vi.spyOn(navigator,'onLine','get').mockImplementation(()=>online);
 const read=vi.fn(async()=>{}),sync=visibleSync(read);await vi.advanceTimersByTimeAsync(60000);expect(read).not.toHaveBeenCalled();
 online=true;window.dispatchEvent(new Event('online'));await vi.advanceTimersByTimeAsync(0);expect(read).toHaveBeenCalledTimes(1);
 online=false;window.dispatchEvent(new Event('offline'));await vi.advanceTimersByTimeAsync(60000);expect(read).toHaveBeenCalledTimes(1);sync.stop();
});
