import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {SupabaseClient} from '@supabase/supabase-js';
type Group={id:string;name:string;status:string};
type Counts=Record<'groups'|'links'|'rooms'|'games'|'changes'|'events'|'requests'|'rates',number>;
type Preview=Group&{counts:Counts};
type Backup={format:string;receipt:string;expires_at:string;snapshot:{group:{id:string}};counts:Counts};
const labels:Record<keyof Counts,string>={groups:'グループ',links:'共有URL対応表',rooms:'大会（削除済みも含む）',games:'対局（大会内データ）',changes:'変更・復元履歴',events:'更新インデックス',requests:'再送防止リクエスト',rates:'大会固有の利用制限レコード'};
export function downloadGroupBackup(backup:Backup){
 const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download=`janroku-group-${backup.snapshot.group.id}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
 try{document.body.append(a);a.click();}finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
export function AdminGroupControls({group,client,onChanged,onDenied,disabled=false}:{group:Group;client:SupabaseClient;onChanged:()=>void;onDenied:()=>void;disabled?:boolean}){
 const [preview,setPreview]=useState<Preview|null>(null),[receipt,setReceipt]=useState(''),[expires,setExpires]=useState(''),[name,setName]=useState(''),[id,setId]=useState(''),[saved,setSaved]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const alive=useRef(false),working=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 function reset(){setReceipt('');setExpires('');setName('');setId('');setSaved(false);}
 async function run(task:()=>Promise<void>){if(working.current||disabled)return;working.current=true;setBusy(true);setMessage('');try{await task();}catch(error){if(alive.current){const e=error as {code?:string;message?:string};if(e.code==='42501'){setPreview(null);reset();onDenied();}else setMessage(e.code==='PGRST202'||e.code==='42883'?'管理操作用SQLが未適用です。group-lifecycle.sql の設定手順を確認してください。':e.message==='BACKUP_STALE'||e.message==='STATE_CHANGED'?'対象が変更されました。一覧を更新し、バックアップからやり直してください。':e.message==='FRESH_BACKUP_REQUIRED'?'バックアップの有効期限が切れたか、確認できません。再ダウンロードしてください。':e.message==='DISABLE_FIRST'?'先にグループを無効化してください。':'操作を確認できませんでした。一覧を更新して状態を確認し、再試行してください。');}}finally{working.current=false;if(alive.current)setBusy(false);}}
 async function status(){
  const next=group.status==='disabled'?'active':'disabled';
  if(!window.confirm(`${group.name}\nID: ${group.id}\n${next==='disabled'?'閲覧・編集を停止します。データとURLは維持します。':'同じ共有URLで閲覧・編集を再開します。'}\n実行しますか？`))return;
  const result=await client.rpc('jr_admin_group_status',{target:group.id,expected_status:group.status,new_status:next});if(result.error)throw result.error;if(result.data?.id!==group.id||result.data?.status!==next)throw Error();
  if(alive.current){setPreview(null);reset();onChanged();}
 }
 async function inspect(){const result=await client.rpc('jr_admin_group_preview',{target:group.id},{get:true});if(result.error)throw result.error;if(result.data?.id!==group.id||!result.data.counts)throw Error();if(alive.current){reset();setPreview(result.data);}}
 async function backup(){
  const result=await client.rpc('jr_admin_group_export',{target:group.id});if(result.error)throw result.error;
  const data=result.data as Backup;if(data?.format!=='janroku-group-backup-v1'||data.snapshot?.group.id!==group.id||!data.receipt||!data.expires_at)throw Error();
  if(!alive.current)return;downloadGroupBackup(data);setReceipt(data.receipt);setExpires(data.expires_at);setSaved(false);setPreview(old=>old?{...old,counts:data.counts}:old);setMessage('JSONのダウンロードを開始しました。保存先でファイルを開き、対象IDと内容を確認してください。');
 }
 async function remove(){
  if(!saved||name!==group.name||id!==group.id||!receipt)return;
  const result=await client.rpc('jr_admin_group_delete',{target:group.id,export_receipt:receipt,confirm_name:name,confirm_id:id,backup_saved:saved});if(result.error)throw result.error;if(result.data?.id!==group.id||result.data?.deleted!==true)throw Error();
  if(alive.current){setPreview(null);reset();onChanged();}
 }
 return <div className="admin-group-controls"><button className="button secondary" disabled={busy||disabled} onClick={()=>void run(status)}>{group.status==='disabled'?'復元':'無効化'}</button><button className="button secondary" disabled={busy||disabled} onClick={()=>void run(inspect)}>バックアップ・完全削除</button>
 {message&&<p role="status">{message}</p>}
 {preview&&createPortal(<div className="admin-operation-overlay"><section className="admin-delete-review" role="dialog" aria-label={group.name+'の削除対象確認'} aria-modal="true"><h3>完全削除の対象確認</h3><strong>{preview.name}</strong><p className="admin-group-id">ID: {preview.id}</p><dl>{Object.entries(labels).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{preview.counts[key as keyof Counts]}件</dd></div>)}</dl><p>参加者・スコア・ルール・修正前の記録も削除されます。対局は大会データに含まれ、別レコードとして二重には数えません。削除用バックアップ確認記録も削除します。他グループ、従来の公開大会、共通利用制限、管理者アカウントは対象外です。操作履歴には対象ID・操作者ID・日時・件数と、旧URL再利用を防ぐ識別情報だけ残します。</p><p className="admin-danger">完全削除後は共有URLが無効になり、この画面からは復元できません。自動削除はありません。</p>
 {preview.status!=='disabled'?<p>まず一覧の「無効化」を実行してください。無効化だけならデータを残して復元できます。</p>:<><button className="button secondary" disabled={busy||disabled} onClick={()=>void run(backup)}>削除前のJSONバックアップをダウンロード</button>{receipt&&<form onSubmit={e=>{e.preventDefault();void run(remove);}}><p>この確認は {new Date(expires).toLocaleString('ja-JP')} まで有効です。保存ファイルには個人データが含まれます。安全な場所へ保管してください。</p><label><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)}/>保存先でバックアップファイルと対象ID・内容を確認しました</label><label>グループ名を入力<input aria-label="完全削除するグループ名" value={name} onChange={e=>setName(e.target.value)} autoComplete="off"/></label><label>グループIDを入力<input aria-label="完全削除するグループID" value={id} onChange={e=>setId(e.target.value)} autoComplete="off"/></label><button className="button danger-button" disabled={busy||disabled||!saved||name!==group.name||id!==group.id||Date.now()>=Date.parse(expires)}>このグループを完全削除する</button></form>}</>}
 <button className="text-button" autoFocus disabled={busy} onClick={()=>{setPreview(null);reset();}}>確認を閉じる</button></section></div>,document.body)}
 </div>;
}
