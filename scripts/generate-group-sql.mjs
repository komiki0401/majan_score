import {readFileSync,writeFileSync} from 'node:fs';
const base=readFileSync('supabase/setup.sql','utf8').replaceAll('\r\n','\n');
const functions=[...base.matchAll(/create or replace function public\.[\s\S]*?\$\$;/g)].map(match=>match[0]).filter(sql=>!sql.startsWith('create or replace function public.jr_publish_existing(')).map(sql=>sql.replaceAll('public.','jr_group_private.'));
if(functions.length!==13)throw Error('Review source function changes before regenerating group SQL: '+functions.length);
const output=readFileSync('supabase/groups-header.sql','utf8').replaceAll('\r\n','\n')+'\n-- Reuse the existing validation, calculation, conflict and audit engine in an isolated schema.\n'+functions.join('\n\n')+'\n'+readFileSync('supabase/groups-footer.sql','utf8').replaceAll('\r\n','\n');
if(process.argv.includes('--check')){if(readFileSync('supabase/groups.sql','utf8').replaceAll('\r\n','\n')!==output)throw Error('Run npm run groups:sql and review the generated migration.');console.log('Group SQL matches its reviewed sources.');}else writeFileSync('supabase/groups.sql',output);
