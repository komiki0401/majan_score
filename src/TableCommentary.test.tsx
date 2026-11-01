// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {TableCommentary} from './TableCommentary';
import {emptyState} from './domain';
import {commentaryLines} from './commentary';
let root:Root,host:HTMLDivElement;
beforeEach(()=>{vi.useFakeTimers();(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();});
it('rotates every 20 seconds without controls, wraps and clears its timer',async()=>{
 const state=structuredClone(emptyState),lines=commentaryLines(state);
 await act(async()=>root.render(<TableCommentary state={state}/>));
 const text=()=>host.querySelector('p')?.textContent;
 expect(host.querySelector('button')).toBeNull();expect(text()).toBe(lines[0]);
 await act(async()=>vi.advanceTimersByTime(19999));expect(text()).toBe(lines[0]);
 await act(async()=>vi.advanceTimersByTime(1));expect(text()).toBe(lines[1]);
 await act(async()=>vi.advanceTimersByTime(20000*(lines.length-1)));expect(text()).toBe(lines[0]);
 await act(async()=>root.render(<></>));expect(vi.getTimerCount()).toBe(0);
});
