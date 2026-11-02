export function groupAccess(hash=location.hash):{mode:boolean;token:string|null}{
 if(hash.startsWith('#/g/')){const value=shortGroupRoute(hash)?.editorToken;return {mode:true,token:value??null};}
 const params=new URLSearchParams(hash.replace(/^#/,''));const value=params.get('group');
 return {mode:params.has('group'),token:value&&/^[0-9a-f]{64}$/.test(value)?value:null};
}
export function shortGroupRoute(hash=location.hash):{shortId:string;roomId:string|null;editorToken:string|null}|null{
 const match=/^#\/g\/([A-Za-z0-9_-]{16})(?:\?([^#]*))?$/.exec(hash);if(!match)return null;
 const params=new URLSearchParams(match[2]??''),token=params.get('edit'),room=params.get('room');
 return {shortId:match[1],roomId:room&&/^[0-9a-f-]{36}$/i.test(room)?room:null,editorToken:token&&/^[a-f0-9]{64}$/.test(token)?token:null};
}
export function shortGroupURL(id:string,roomId?:string,editorToken?:string):string{
 if(!/^[A-Za-z0-9_-]{16}$/.test(id)||editorToken&&!/^[a-f0-9]{64}$/.test(editorToken))throw Error('INVALID_GROUP_LINK');
 const params=new URLSearchParams();if(roomId)params.set('room',roomId);if(editorToken)params.set('edit',editorToken);
 return location.origin+location.pathname+'#/g/'+id+(params.size?'?'+params.toString():'');
}
export function newGroupToken():string{return [...crypto.getRandomValues(new Uint8Array(32))].map(value=>value.toString(16).padStart(2,'0')).join('');}
export function groupShareURL(token:string,roomId?:string,config?:{url:string;key:string}):string{
 if(!/^[0-9a-f]{64}$/.test(token))throw Error('INVALID_GROUP_LINK');
 const url=new URL(location.origin+location.pathname),params=new URLSearchParams();params.set('group',token);if(roomId)params.set('room',roomId);if(config){params.set('project',config.url);params.set('key',config.key);}url.hash=params.toString();return url.href;
}
export function groupRPC(name:string,groupMode:boolean):string{
 if(!groupMode)return name;
 if(name==='jr_public_create')return 'jr_group_tournament_create';
 return name.replace(/^jr_public_/,'jr_group_');
}
export function entryRoute(hash:string):'landing'|'sample'|'workspace'|'admin'{
 if(hash==='#/admin')return 'admin';
 if(hash.startsWith('#/g/'))return 'workspace';
 if(hash==='#sample')return 'sample';
 const params=new URLSearchParams(hash.replace(/^#/,''));
 return params.has('group')||params.has('room')||params.has('project')||hash==='#legacy'?'workspace':'landing';
}
