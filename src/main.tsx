import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {Landing} from './Landing';
import {groupAccess,entryRoute} from './group-sharing';
const AdminDashboard=React.lazy(()=>import('./AdminDashboard'));

function ScopedApp(){
 const [hash,setHash]=React.useState(location.hash);
 React.useEffect(()=>{const changed=()=>setHash(location.hash);window.addEventListener('hashchange',changed);return()=>window.removeEventListener('hashchange',changed);},[]);
 React.useEffect(()=>{window.scrollTo({top:0,behavior:'instant'});},[hash]);
 const group=groupAccess(hash);
 // A new URL scope gets a fresh React tree: no previous group's caches or drafts survive.
 const route=entryRoute(hash);
 if(route==='admin')return <React.Suspense fallback={<main>管理画面を読み込み中…</main>}><AdminDashboard/></React.Suspense>;
 if(route==='sample')return <App key="sample" sample ephemeralSample/>;
 if(route==='workspace')return <App key={group.mode?hash:'legacy'}/>;
 return <Landing/>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><ScopedApp/></React.StrictMode>);
