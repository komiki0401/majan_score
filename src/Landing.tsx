import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Bird,Check,ChevronDown,Users} from 'lucide-react';
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
 const [sampleOpen,setSampleOpen]=useState(false),[sampleStarted,setSampleStarted]=useState(false);
 useEffect(()=>{if(creationOpen){form.current?.scrollIntoView?.({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});form.current?.focus({preventScroll:true});}},[creationOpen]);
 return <div className="try-home">
  <div className="landing try-intro"><header className="landing-nav"><a href="#" aria-label="雀録 トップ"><img className="landing-brand-logo" src={logo} alt="雀録 JANROKU" width="180" height="60"/></a><a href="#legacy" className="landing-existing">以前の雀録を開く <ArrowUpRight size={14}/></a></header>
   <section className="landing-hero"><div className="landing-hero-copy"><p className="landing-kicker">いつもの仲間と、いつもの一局を。</p><h1>集まる。打つ。<br/>思い出が、<em>記録になる。</em></h1><p className="landing-lead">麻雀の時間を、もっと楽しく。<br/>点数も、ランキングも、みんなで共有。<br/>仲間だけの「雀録」をはじめよう。</p><div className="landing-actions"><button className="landing-primary" onClick={()=>setCreationOpen(true)} aria-expanded={creationOpen} aria-controls="landing-group-creation"><Users size={18}/>自分の雀録を作る</button></div><p className="landing-no-signup"><Check size={14}/>ログイン不要 <span>·</span> スマホですぐに使えます</p></div>
 <div className="landing-art" role="img" aria-label="一索の小鳥、發、中、白の麻雀牌をあしらった雀録のビジュアル"><span className="art-orbit orbit-one"/><span className="art-orbit orbit-two"/><span className="art-spark spark-one">✦</span><span className="art-spark spark-two">✧</span><div className="art-caption">GOOD TILES. GOOD TIMES.</div><div className="art-tile tile-bird"><Bird strokeWidth={1.6}/><small>一索</small></div><div className="art-tile tile-green">發</div><div className="art-tile tile-red">中</div><div className="art-tile tile-white"><span/></div><div className="art-score"><span>今日も、いい一局。</span><strong>＋42.0 <small>pt</small></strong><i>記録するたび、思い出がふえる。</i></div></div></section>
   <section hidden={!creationOpen} id="landing-group-creation" className="landing-start" ref={form} tabIndex={-1} aria-labelledby="start-title"><h2 id="start-title">仲間と使う、自分の雀録。</h2><p>名前を決めて、専用URLを仲間にシェア。</p>{creationOpen&&<CreateJanroku/>}<button className="text-button landing-close-creation" onClick={()=>setCreationOpen(false)}>グループ作成を閉じる</button></section>
  </div>
  <section className="sample-accordion" aria-label="サンプル体験">
   <div className="sample-disclosure"><button id="sample-toggle" className="sample-toggle" aria-expanded={sampleOpen} aria-controls="sample-experience" onClick={()=>{setSampleStarted(true);setSampleOpen(value=>!value);}}><span>サンプルを体験する</span><ChevronDown className="sample-chevron" size={20}/></button></div>
   <div id="sample-experience" role="region" aria-labelledby="sample-toggle" hidden={!sampleOpen}>{sampleStarted&&<App sample ephemeralSample onCreate={()=>setCreationOpen(true)}/>}</div>
  </section>
 </div>;
}
