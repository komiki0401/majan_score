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
it('keeps the current message on an unchanged render and resets one timer when the data changes',async()=>{
 const state=structuredClone(emptyState);await act(async()=>root.render(<TableCommentary state={state}/>));await act(async()=>vi.advanceTimersByTime(60000));const current=host.querySelector('p')?.textContent;
 await act(async()=>root.render(<TableCommentary state={state}/>));expect(host.querySelector('p')?.textContent).toBe(current);expect(vi.getTimerCount()).toBe(1);
 const changed={...structuredClone(emptyState),players:[{id:'p',name:'記録者'}],games:[{id:'g',date:'2026-11-02',table:'1',rules:state.rules,revisions:[],rows:[{playerId:'p',score:25000,rank:1,point:10}]}]};
 await act(async()=>root.render(<TableCommentary state={changed}/>));expect(host.querySelector('p')?.textContent).toBe(commentaryLines(changed)[0]);expect(vi.getTimerCount()).toBe(1);
});
