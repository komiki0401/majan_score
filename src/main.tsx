import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {groupAccess} from './group-sharing';

function ScopedApp(){
 const [hash,setHash]=React.useState(location.hash);
 React.useEffect(()=>{const changed=()=>setHash(location.hash);window.addEventListener('hashchange',changed);return()=>window.removeEventListener('hashchange',changed);},[]);
 const group=groupAccess(hash);
 // A new URL scope gets a fresh React tree: no previous group's caches or drafts survive.
 return <App key={group.mode?hash:'legacy'}/>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><ScopedApp/></React.StrictMode>);
