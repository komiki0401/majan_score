import {useRef} from 'react';

export function SignedNumberInput({value,onChange,label,decimal=false}:{value:string;onChange:(value:string)=>void;label:string;decimal?:boolean}){
 const input=useRef<HTMLInputElement>(null);
 return <div className="signed-number-input"><button type="button" className="sign-toggle" aria-label={`${label}のプラス・マイナスを切り替え`} aria-pressed={value.startsWith('-')} onPointerDown={e=>e.preventDefault()} onClick={()=>{
  const next=value.startsWith('-')?value.slice(1):'-'+value;
  onChange(next);
  // Keep the iPhone keyboard open and insert the next digit after the sign.
  input.current?.focus({preventScroll:true});
  requestAnimationFrame(()=>input.current?.setSelectionRange(next.length,next.length));
 }}>＋/−</button><input ref={input} aria-label={label} aria-describedby="signed-number-help" inputMode={decimal?'decimal':'numeric'} type="text" autoComplete="off" value={value} onFocus={e=>e.target.select()} onChange={e=>{
  if((decimal?/^-?\d*(?:\.\d*)?$/:/^-?\d*$/).test(e.target.value))onChange(e.target.value);
 }}/></div>;
}
