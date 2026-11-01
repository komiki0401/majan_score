/** No periodic work in background/offline; resume promptly, never overlap requests. */
export function visibleSync(task:(fresh:boolean)=>Promise<unknown>,milliseconds=15000){
 let stopped=false,running=false,pending=false,timer:ReturnType<typeof setTimeout>|undefined;
 const available=()=>!stopped&&document.visibilityState!=='hidden'&&navigator.onLine!==false;
 const clear=()=>{clearTimeout(timer);timer=undefined;};
 async function run(fresh=false){
  if(!available())return;
  if(running){pending=true;return;}
  clear();running=true;
  try{await task(fresh);}finally{running=false;if(stopped)return;if(pending){pending=false;void run(true);}else if(available())timer=setTimeout(()=>void run(),milliseconds);}
 }
 const changed=()=>{clear();if(available())void run(true);};
 document.addEventListener('visibilitychange',changed);window.addEventListener('online',changed);window.addEventListener('offline',changed);
 void run();
 return {run,stop(){stopped=true;clear();document.removeEventListener('visibilitychange',changed);window.removeEventListener('online',changed);window.removeEventListener('offline',changed);}};
}
