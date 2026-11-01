// @vitest-environment jsdom
import React,{act,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {SignedNumberInput} from './SignedNumberInput';
let root:Root,host:HTMLDivElement;
beforeEach(()=>{(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function show(initial:string,decimal=false){function Example(){const [value,setValue]=useState(initial);return <SignedNumberInput label="テスト入力" value={value} onChange={setValue} decimal={decimal}/>;}await act(async()=>root.render(<Example/>));return host.querySelector('input')!;}
async function type(input:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
describe('signed number entry on numeric mobile keyboards',()=>{
 it('toggles a score without needing a keyboard minus key',async()=>{const input=await show('1500');const button=host.querySelector('button')!;await act(async()=>button.click());expect(input.value).toBe('-1500');expect(button.getAttribute('aria-pressed')).toBe('true');expect(input.getAttribute('inputmode')).toBe('numeric');await act(async()=>button.click());expect(input.value).toBe('1500');});
 it('allows a sign before digits and negative decimal points',async()=>{const input=await show('',true);await act(async()=>host.querySelector('button')!.click());expect(input.value).toBe('-');await type(input,'-12.3456');expect(input.value).toBe('-12.3456');expect(input.getAttribute('inputmode')).toBe('decimal');await act(async()=>host.querySelector('button')!.click());expect(input.value).toBe('12.3456');});
 it('rejects nonnumeric drafts and fractional raw scores',async()=>{const input=await show('1000');await type(input,'1.5');expect(input.value).toBe('1000');await type(input,'1e3');expect(input.value).toBe('1000');await type(input,'-2000');expect(input.value).toBe('-2000');});
});
