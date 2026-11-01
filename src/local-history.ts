import {repository,type State} from './domain';
export type LocalBackup={id:string;date:string;state:State};
export function localBackups():LocalBackup[]{try{return JSON.parse(localStorage.getItem('janroku-local-history')??'[]');}catch{return [];}}
export function saveLocalWithHistory(next:State){
 const previous=repository.load(),backups=[{id:crypto.randomUUID(),date:new Date().toISOString(),state:previous},...localBackups()].slice(0,20);
 while(backups.length){try{localStorage.setItem('janroku-local-history',JSON.stringify(backups));break;}catch{if(backups.length===1)throw Error('BACKUP_CAPACITY');backups.pop();}}
 repository.save(next);
}
