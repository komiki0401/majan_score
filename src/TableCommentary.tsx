import {useEffect,useState} from 'react';
import {commentaryLines} from './commentary';
import {type State} from './domain';
export function TableCommentary({state}:{state:State}){
 const lines=commentaryLines(state),key=JSON.stringify(lines);
 const [index,setIndex]=useState(0);
 useEffect(()=>{setIndex(0);if(lines.length<2)return;const timer=setInterval(()=>setIndex(value=>(value+1)%lines.length),20000);return()=>clearInterval(timer);},[key]);
 return <div className="live-commentary"><span>卓の実況</span><p role="status" aria-live="polite">{lines[index%lines.length]}</p></div>;
}
