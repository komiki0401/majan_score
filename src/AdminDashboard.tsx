import {useEffect,useMemo,useRef,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
import {readConfig} from './cloud';
import {shortGroupURL} from './group-sharing';
import './admin.css';
import {AdminGroupControls} from './AdminGroupControls';
type Stats={total_groups:number;new_this_month:number;active_groups:number;total_games:number;deletion_candidates:number};
type Group={id:string;name:string;created_at:string;last_game_update_at:string|null;game_count:number;player_count:number;status:string;short_id:string;deletion_candidate:boolean;activity_estimated:boolean};
const date=(value:string|null)=>value?new Date(value).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'対局記録なし';
export default function AdminDashboard(){
 const [config]=useState(readConfig);
 const client=useMemo(()=>config?createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'janroku-admin-auth'}}):null,[config]);
 const [phase,setPhase]=useState<'login'|'mfa'|'dashboard'>('login'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState(''),[factor,setFactor]=useState(''),[qr,setQR]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[stats,setStats]=useState<Stats|null>(null),[rows,setRows]=useState<Group[]>([]);
 const [query,setQuery]=useState(''),[candidates,setCandidates]=useState(false),[page,setPage]=useState({offset:0,total:0,search:'',candidates:false});
 const generation=useRef(0);
 function clear(){generation.current++;setBusy(false);setStats(null);setRows([]);setPhase('login');setPassword('');setCode('');setFactor('');setQR('');setMessage('');}
 useEffect(()=>{if(!client)return;const {data}=client.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')clear();});return()=>{generation.current++;data.subscription.unsubscribe();void client.auth.stopAutoRefresh();};},[client]);
 async function execute(task:(ticket:number)=>Promise<void>){if(busy)return;const ticket=generation.current;setBusy(true);setMessage('');try{await task(ticket);}catch(error){if(ticket===generation.current)setMessage(error instanceof Error?error.message:'処理を確認できませんでした。');}finally{if(ticket===generation.current)setBusy(false);}}
 async function load(ticket:number,offset=0,search='',onlyCandidates=false){
  if(!client)return;
  const [summary,list]=await Promise.all([client.rpc('jr_admin_stats',{}, {get:true}),client.rpc('jr_admin_groups',{page_offset:offset,page_size:50,search_text:search,candidates_only:onlyCandidates},{get:true})]);
  if(ticket!==generation.current)return;
  if(summary.error||list.error||!summary.data||!Array.isArray(list.data?.groups)){
   setStats(null);setRows([]);setPhase('mfa');
   const missing=[summary.error?.code,list.error?.code].some(value=>value==='PGRST202'||value==='42883');
   throw Error(missing?'管理機能のSQLが未適用です。設定手順を確認してください。':'管理者権限を確認できませんでした。許可リストと認証アプリの確認が必要です。');
  }
  setStats(summary.data);setRows(list.data.groups);setPage({offset,total:list.data.total,search,candidates:onlyCandidates});setPhase('dashboard');
 }
 async function login(ticket:number){
  if(!client)return;const signed=await client.auth.signInWithPassword({email:email.trim(),password});setPassword('');if(ticket!==generation.current)return;
  if(signed.error)throw Error('ログインを確認できませんでした。メールアドレスとパスワードを確認してください。');
  const factors=await client.auth.mfa.listFactors();if(ticket!==generation.current)return;if(factors.error)throw Error('認証アプリの設定を確認できませんでした。');
  setFactor(factors.data.totp.find(item=>item.status==='verified')?.id??'');setPhase('mfa');
 }
 async function enroll(ticket:number){if(!client)return;const result=await client.auth.mfa.enroll({factorType:'totp',friendlyName:'雀録 管理'});if(ticket!==generation.current)return;if(result.error||result.data.type!=='totp')throw Error('認証アプリの登録を確認できませんでした。');setFactor(result.data.id);setQR(result.data.totp.qr_code);}
 async function verify(ticket:number){if(!client||!factor)return;const result=await client.auth.mfa.challengeAndVerify({factorId:factor,code});setCode('');if(ticket!==generation.current)return;if(result.error)throw Error('認証コードを確認できませんでした。新しい6桁のコードで再試行してください。');setQR('');await load(ticket);}
 async function logout(){clear();setBusy(false);if(client)await client.auth.signOut({scope:'local'});}
 async function copy(row:Group){try{await navigator.clipboard.writeText(shortGroupURL(row.short_id));setMessage('閲覧URLをコピーしました。');}catch{setMessage('URL欄を選択してコピーしてください。');}}
 return <div className="admin-page"><header className="admin-header"><a href="#">雀録トップへ</a><h1>運営者ダッシュボード</h1>{phase!=='login'&&<button className="button secondary" onClick={()=>void logout()}>ログアウト</button>}</header><main>
 {!config?<p role="alert">既存Supabaseの公開接続設定が必要です。</p>:phase==='login'?<section className="panel admin-auth"><h2>管理者ログイン</h2><p>登録済みの運営者アカウントと認証アプリが必要です。一般のグループ利用にはログイン不要です。</p><form onSubmit={e=>{e.preventDefault();void execute(login);}}><label>メールアドレス<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>パスワード<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="button primary" disabled={busy}>ログイン</button></form></section>:phase==='mfa'?<section className="panel admin-auth"><h2>認証アプリの確認</h2><p>管理情報は、DBの管理者許可リストと二段階認証の両方を確認した後に表示します。</p>{!factor?<button className="button secondary" disabled={busy} onClick={()=>void execute(enroll)}>認証アプリを登録</button>:<>{qr&&<div className="admin-qr"><p>認証アプリでQRコードを読み取ってください。この画面を他の人に共有しないでください。</p><img src={qr} alt="認証アプリ登録用QRコード" referrerPolicy="no-referrer"/></div>}<form onSubmit={e=>{e.preventDefault();void execute(verify);}}><label>6桁の認証コード<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value)} required/></label><button className="button primary" disabled={busy}>認証して管理画面を開く</button></form></>}</section>:stats&&<>
 <p>グループの無効化・復元と、バックアップ後の完全削除ができます。日時は日本時間。アクティブは過去30日以内に対局データを更新したグループです。</p><div className="admin-stats">{[['累計発行グループ数',stats.total_groups],['今月の新規作成数',stats.new_this_month],['アクティブグループ数',stats.active_groups],['累計対局数',stats.total_games],['削除候補',stats.deletion_candidates]].map(([label,value])=><section className="panel" key={label}><h2>{label}</h2><strong>{value}</strong></section>)}</div>
 <section className="panel admin-list"><div className="panel-heading"><h2>発行済みグループ一覧</h2><button className="button secondary" disabled={busy} onClick={()=>void execute(ticket=>load(ticket,page.offset,page.search,page.candidates))}>最新情報に更新</button></div><p>対局数は削除済み大会も含む保存済み対局数です。参加人数はグループ内の同名をまとめています。旧データの最終更新日は推定値の場合があります。</p><form className="admin-filters" onSubmit={e=>{e.preventDefault();void execute(ticket=>load(ticket,0,query,candidates));}}><label>グループ名で検索<input value={query} maxLength={60} onChange={e=>setQuery(e.target.value)}/></label><label><input type="checkbox" checked={candidates} onChange={e=>setCandidates(e.target.checked)}/>2年以上未更新の削除候補のみ</label><button className="button secondary" disabled={busy}>検索・絞り込み</button></form>
 <p>削除候補は確認用です。自動削除はありません。完全削除は手動の確認操作が必要です。未対局のグループは、この条件の候補に含めません。</p><div className="admin-table-scroll"><table><thead><tr>{['グループ','作成日','最終対局更新','対局数','参加人数','状態','閲覧URL','管理操作'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id}><th>{row.name}<small>{row.id}</small></th><td>{date(row.created_at)}</td><td>{date(row.last_game_update_at)}{row.activity_estimated&&<small>旧データからの推定</small>}</td><td>{row.game_count}</td><td>{row.player_count}</td><td>{row.status==='active'?'有効':row.status==='disabled'?'無効':row.status}{row.deletion_candidate&&<small>削除候補</small>}</td><td><input aria-label={row.name+'の閲覧URL'} readOnly value={shortGroupURL(row.short_id)} onFocus={e=>e.target.select()}/><button className="text-button" onClick={()=>void copy(row)}>URLをコピー</button></td><td><AdminGroupControls group={row} client={client!} disabled={busy} onChanged={()=>void execute(ticket=>load(ticket,page.offset,page.search,page.candidates))} onDenied={()=>{setStats(null);setRows([]);setPhase('mfa');setMessage('管理者権限を確認できませんでした。再認証してください。');}}/></td></tr>)}</tbody></table></div>{!rows.length&&<p>該当するグループはありません。</p>}<div className="admin-pagination"><span>{page.total}件中 {rows.length?page.offset+1:0}〜{page.offset+rows.length}件</span><button className="button secondary" disabled={busy||page.offset===0} onClick={()=>void execute(ticket=>load(ticket,Math.max(0,page.offset-50),page.search,page.candidates))}>前へ</button><button className="button secondary" disabled={busy||page.offset+rows.length>=page.total} onClick={()=>void execute(ticket=>load(ticket,page.offset+50,page.search,page.candidates))}>次へ</button></div></section></>}
 {message&&<p className="admin-message" role="status">{message}</p>}<p className="muted">初期設定はリポジトリの docs/service-management.md を参照してください。セッションはこのページのメモリ内だけに保持します。</p>
 </main></div>;
}
