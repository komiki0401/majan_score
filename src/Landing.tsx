import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Users} from 'lucide-react';
import logo from './assets/janroku-logo.webp';
import {useCloud} from './cloud';
import {GroupSharing} from './GroupSharing';
import App from './App';
import './landing.css';
const ignore=()=>{};
function CreateJanroku(){
 const cloud=useCloud(ignore,true,false);
 return <GroupSharing cloud={cloud} landing initiallyOpen/>;
}
export function Landing(){
 const form=useRef<HTMLDivElement>(null);
 const [creationOpen,setCreationOpen]=useState(false);
 useEffect(()=>{if(creationOpen){form.current?.scrollIntoView?.({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});form.current?.focus({preventScroll:true});}},[creationOpen]);
 return <div className="try-home">
  <div className="landing try-intro"><header className="landing-nav"><a href="#" aria-label="雀録 トップ"><img className="landing-brand-logo" src={logo} alt="雀録 JANROKU" width="180" height="60"/></a><a href="#legacy" className="landing-existing">以前の雀録を開く <ArrowUpRight size={14}/></a></header>
   <section className="try-heading"><div><p className="landing-kicker">入力する。順位が変わる。みんなで楽しむ。</p><h1>まずは一局、試してみよう。</h1><p>下のサンプルでスコア入力・ランキング・グラフを体験できます。</p></div><button className="landing-primary" onClick={()=>setCreationOpen(true)} aria-expanded={creationOpen} aria-controls="landing-group-creation"><Users size={18}/>自分の雀録を作る</button></section>
   <section hidden={!creationOpen} id="landing-group-creation" className="landing-start" ref={form} tabIndex={-1} aria-labelledby="start-title"><h2 id="start-title">仲間と使う、自分の雀録。</h2><p>名前を決めて、専用URLを仲間にシェア。</p>{creationOpen&&<CreateJanroku/>}<button className="text-button landing-close-creation" onClick={()=>setCreationOpen(false)}>グループ作成を閉じる</button></section>
  </div>
  <App sample ephemeralSample onCreate={()=>setCreationOpen(true)}/>
 </div>;
}
