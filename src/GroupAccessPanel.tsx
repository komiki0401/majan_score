import {useState} from 'react';
import type {CloudConnection} from './cloud';
export function GroupAccessPanel({cloud,settings=false}:{cloud:CloudConnection;settings?:boolean}){
 const [key,setKey]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const editor=cloud.groupName&&!cloud.groupError?cloud.editorShareURL?.():null;
 async function copy(value:string){try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(value);setMessage('コピーしました');}catch{setMessage('URL欄を選択してコピーしてください。');}}
 return <section className="panel group-sharing group-access"><div className="panel-heading"><h2>{settings?'グループの共有設定':cloud.groupName||'グループの雀録'}</h2><span className="pill">{cloud.readOnly?'閲覧専用':'入力・編集可'}</span></div><div className="cloud-body">
 {cloud.groupError&&<p role="alert">{cloud.groupError}</p>}
 <p>{cloud.shortId?'短いURLは閲覧専用です。入力・編集を許可する相手には、編集用URLまたは編集キーを別に共有してください。':'このURLを知る人は閲覧・入力・編集できます。短縮URLは追加SQLの適用後に利用できます。'}</p>
 <label>{cloud.shortId?'閲覧用URL':'共有URL'}<input aria-label={settings?'設定のグループ共有URL':'グループの共有URL'} readOnly value={cloud.shareURL()} onFocus={e=>e.target.select()}/></label>
 <button className="button secondary" onClick={()=>void copy(cloud.shareURL())}>{cloud.shortId?'閲覧URLをコピー':'グループのURLをコピー'}</button>
 {editor&&<details className="editor-sharing"><summary>入力・編集用URLを共有する</summary><p>このリンクを受け取る人には、従来の共有URLと同じ入力・編集・削除・復元の権限を渡します。</p><label>編集用URL<input aria-label="入力・編集用URL" readOnly value={editor} onFocus={e=>e.target.select()}/></label><button className="button secondary" onClick={()=>void copy(editor)}>入力・編集用URLをコピー</button></details>}
 {cloud.shortId&&<details open={cloud.readOnly||!!cloud.groupError}><summary>{cloud.readOnly?'入力・編集するためのキーを入力':'編集キーを変更'}</summary><form onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setMessage('');try{await cloud.authorizeGroup(key.trim());}catch(error){setMessage(error instanceof Error?error.message:'編集キーを確認してください。');}finally{setBusy(false);setKey('');}}}><label>編集キー<input type="password" aria-label="グループの編集キー" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} pattern="[a-f0-9]{64}" required/></label><button className="button secondary" disabled={busy}>{busy?'確認中…':'編集キーを確認'}</button></form></details>}
 <small>閲覧URLも公開SNSへ投稿せず、共有相手を確認してください。編集キーと編集用URLは特に大切に保管してください。</small>{message&&<p role="status">{message}</p>}
 </div></section>;
}
