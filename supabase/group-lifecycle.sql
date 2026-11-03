-- Apply AFTER groups.sql and service-management.sql. Installs operations only;
-- applying this file does not disable or delete any existing group/data.
begin;
do $$begin
 if to_regprocedure('jr_group_private.require_admin()') is null or to_regprocedure('public.jr_group_short_link()') is null then
  raise exception 'Apply service-management.sql first';
 end if;
end;$$;
create table if not exists jr_group_private.admin_group_actions(
 id uuid primary key default gen_random_uuid(),target_group uuid not null,
 actor uuid not null,action text not null check(action in ('disable','restore','export','delete')),
 counts jsonb not null default '{}',created_at timestamptz not null default now(),
 retired_token_fingerprint text,retired_short_id text,group_created_at timestamptz
);
create index if not exists jr_admin_actions_target on jr_group_private.admin_group_actions(target_group,created_at);
create unique index if not exists jr_admin_deleted_group on jr_group_private.admin_group_actions(target_group) where action='delete';
create unique index if not exists jr_admin_retired_key on jr_group_private.admin_group_actions(retired_token_fingerprint) where action='delete';
create unique index if not exists jr_admin_retired_link on jr_group_private.admin_group_actions(retired_short_id) where action='delete';
create table if not exists jr_group_private.admin_group_exports(
 id uuid primary key default gen_random_uuid(),group_id uuid not null references jr_group_private.groups(id),
 actor uuid not null,fingerprint text not null,expires_at timestamptz not null default now()+interval '15 minutes'
);
alter table jr_group_private.admin_group_actions enable row level security;
alter table jr_group_private.admin_group_exports enable row level security;
revoke all on jr_group_private.admin_group_actions,jr_group_private.admin_group_exports from public,anon,authenticated;

-- A disabled group is denied through both legacy edit tokens and short links.
create or replace function jr_group_private.current_group() returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare headers jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 token text:=nullif(headers->>'x-janroku-group',''); link text:=nullif(headers->>'x-janroku-view','');
 editor_group uuid;view_group uuid;target uuid;
begin
 if token is not null then
  if token!~'^[0-9a-f]{64}$' then raise exception 'GROUP_NOT_FOUND' using errcode='42501';end if;
  select id into editor_group from jr_group_private.groups where token_hash=encode(sha256(convert_to(token,'UTF8')),'hex');
  if editor_group is null then raise exception 'GROUP_NOT_FOUND' using errcode='42501';end if;
 end if;
 if link is not null then
  if link!~'^[A-Za-z0-9_-]{16}$' then raise exception 'GROUP_NOT_FOUND' using errcode='42501';end if;
  select group_id into view_group from jr_group_private.group_links where short_id=link;
  if view_group is null or (editor_group is not null and editor_group<>view_group) then raise exception 'GROUP_NOT_FOUND' using errcode='42501';end if;
 end if;
 target:=coalesce(editor_group,view_group);
 if target is null or not exists(select 1 from jr_group_private.groups where id=target and status='active') then raise exception 'GROUP_NOT_FOUND' using errcode='42501';end if;
 return target;
end;$$;
create or replace function jr_group_private.require_editor() returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare target uuid:=jr_group_private.current_group();token text:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-janroku-group';
begin
 -- Serialize in-flight writes with disable/export/delete and then recheck access.
 perform pg_advisory_xact_lock_shared(hashtextextended('janroku-group:'||target::text,0));
 target:=jr_group_private.current_group();
 if token is null or token!~'^[0-9a-f]{64}$' or not exists(select 1 from jr_group_private.groups where id=target and token_hash=encode(sha256(convert_to(token,'UTF8')),'hex')) then raise exception 'READ_ONLY' using errcode='42501';end if;
 return target;
end;$$;

-- Deterministic complete group snapshot. Shared rate buckets and admin records
-- deliberately stay outside the payload and deletion scope.
create or replace function jr_group_private.group_snapshot(target uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('group',(select to_jsonb(g) from jr_group_private.groups g where id=target),
 'link',(select to_jsonb(l) from jr_group_private.group_links l where group_id=target),
 'rooms',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from jr_group_private.rooms r where group_id=target),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.room_id) from jr_group_private.jr_public_events e join jr_group_private.rooms r on r.id=e.room_id where r.group_id=target),'[]'),
 'changes',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from jr_group_private.jr_public_changes c join jr_group_private.rooms r on r.id=c.room_id where r.group_id=target),'[]'),
 'requests',coalesce((select jsonb_agg(to_jsonb(q) order by q.room_id,q.request_id) from jr_group_private.jr_public_requests q join jr_group_private.rooms r on r.id=q.room_id where r.group_id=target),'[]'),
 'rates',coalesce((select jsonb_agg(to_jsonb(b) order by b.bucket,b.window_start) from jr_group_private.jr_public_rates b where exists(select 1 from jr_group_private.rooms r where r.group_id=target and (b.bucket='room-minute:'||r.id or b.bucket='room-day:'||r.id or starts_with(b.bucket,'device:'||r.id||':')))),'[]'));
$$;
create or replace function jr_group_private.snapshot_counts(snapshot jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('groups',1,'links',case when snapshot->'link'='null'::jsonb then 0 else 1 end,
 'rooms',jsonb_array_length(snapshot->'rooms'),'games',(select coalesce(sum(jsonb_array_length(r->'state'->'games')),0) from jsonb_array_elements(snapshot->'rooms') r),
 'changes',jsonb_array_length(snapshot->'changes'),'events',jsonb_array_length(snapshot->'events'),
 'requests',jsonb_array_length(snapshot->'requests'),'rates',jsonb_array_length(snapshot->'rates'));
$$;
create or replace function public.jr_admin_lifecycle_status() returns jsonb
language sql stable set search_path='' as $$select '{"version":1}'::jsonb;$$;
create or replace function public.jr_admin_group_preview(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;
begin
 perform jr_group_private.require_admin();
 perform pg_advisory_xact_lock(hashtextextended('janroku-group:'||target::text,0));
 snapshot:=jr_group_private.group_snapshot(target);
 if snapshot->'group'='null'::jsonb then raise exception 'GROUP_NOT_FOUND';end if;
 return jsonb_build_object('id',target,'name',snapshot->'group'->>'name','status',snapshot->'group'->>'status','counts',jr_group_private.snapshot_counts(snapshot));
end;$$;
create or replace function public.jr_admin_group_status(target uuid,expected_status text,new_status text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous text;
begin
 perform jr_group_private.require_admin();
 if expected_status is null or new_status is null or expected_status not in ('active','disabled') or new_status not in ('active','disabled') or expected_status=new_status then raise exception 'INVALID_STATUS';end if;
 perform pg_advisory_xact_lock(hashtextextended('janroku-group:'||target::text,0));
 select status into previous from jr_group_private.groups where id=target for update;
 if previous is null then raise exception 'GROUP_NOT_FOUND';end if;
 if previous<>expected_status then raise exception 'STATE_CHANGED';end if;
 update jr_group_private.groups set status=new_status where id=target;
 delete from jr_group_private.admin_group_exports where group_id=target;
 insert into jr_group_private.admin_group_actions(target_group,actor,action) values(target,auth.uid(),case when new_status='disabled' then 'disable' else 'restore' end);
 return jsonb_build_object('id',target,'status',new_status);
end;$$;
create or replace function public.jr_admin_group_export(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;receipt uuid;
begin
 perform jr_group_private.require_admin();
 perform pg_advisory_xact_lock(hashtextextended('janroku-group:'||target::text,0));
 snapshot:=jr_group_private.group_snapshot(target);
 if snapshot->'group'='null'::jsonb then raise exception 'GROUP_NOT_FOUND';end if;
 if snapshot->'group'->>'status'<>'disabled' then raise exception 'DISABLE_FIRST';end if;
 delete from jr_group_private.admin_group_exports where group_id=target and (expires_at<now() or actor=auth.uid());
 insert into jr_group_private.admin_group_exports(group_id,actor,fingerprint) values(target,auth.uid(),encode(sha256(convert_to(snapshot::text,'UTF8')),'hex')) returning id into receipt;
 insert into jr_group_private.admin_group_actions(target_group,actor,action,counts) values(target,auth.uid(),'export',jr_group_private.snapshot_counts(snapshot));
 return jsonb_build_object('format','janroku-group-backup-v1','exported_at',now(),'receipt',receipt,'expires_at',now()+interval '15 minutes','snapshot',snapshot,'counts',jr_group_private.snapshot_counts(snapshot));
end;$$;
create or replace function public.jr_admin_group_delete(target uuid,export_receipt uuid,confirm_name text,confirm_id uuid,backup_saved boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;counts jsonb;proof jr_group_private.admin_group_exports;
begin
 perform jr_group_private.require_admin();
 if target is null or confirm_id is distinct from target or backup_saved is distinct from true then raise exception 'CONFIRMATION_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('janroku-group:'||target::text,0));
 snapshot:=jr_group_private.group_snapshot(target);
 if snapshot->'group'='null'::jsonb then raise exception 'GROUP_NOT_FOUND';end if;
 if snapshot->'group'->>'status'<>'disabled' then raise exception 'DISABLE_FIRST';end if;
 if confirm_name is distinct from snapshot->'group'->>'name' then raise exception 'CONFIRMATION_REQUIRED';end if;
 select * into proof from jr_group_private.admin_group_exports where id=export_receipt and group_id=target and actor=auth.uid() and expires_at>now() for update;
 if proof.id is null then raise exception 'FRESH_BACKUP_REQUIRED';end if;
 if proof.fingerprint<>encode(sha256(convert_to(snapshot::text,'UTF8')),'hex') then raise exception 'BACKUP_STALE';end if;
 counts:=jr_group_private.snapshot_counts(snapshot);
 delete from jr_group_private.jr_public_rates b where exists(select 1 from jr_group_private.rooms r where r.group_id=target and (b.bucket='room-minute:'||r.id or b.bucket='room-day:'||r.id or starts_with(b.bucket,'device:'||r.id||':')));
 delete from jr_group_private.jr_public_requests q using jr_group_private.rooms r where q.room_id=r.id and r.group_id=target;
 delete from jr_group_private.jr_public_changes c using jr_group_private.rooms r where c.room_id=r.id and r.group_id=target;
 delete from jr_group_private.jr_public_events e using jr_group_private.rooms r where e.room_id=r.id and r.group_id=target;
 delete from jr_group_private.admin_group_exports where group_id=target;
 delete from jr_group_private.rooms where group_id=target;
 delete from jr_group_private.group_links where group_id=target;
 delete from jr_group_private.groups where id=target;
 insert into jr_group_private.admin_group_actions(target_group,actor,action,counts,retired_token_fingerprint,retired_short_id,group_created_at)
 values(target,auth.uid(),'delete',counts,encode(sha256(convert_to(snapshot->'group'->>'token_hash','UTF8')),'hex'),snapshot->'link'->>'short_id',(snapshot->'group'->>'created_at')::timestamptz);
 return jsonb_build_object('id',target,'deleted',true,'counts',counts);
end;$$;
-- Never resurrect a deleted UUID on an old client's creation retry.
create or replace function public.jr_group_create(request_id uuid,group_name text,access_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing jr_group_private.groups; hashed text;clean text:=trim(group_name);initial jsonb;
begin
 if request_id is null or clean is null or length(clean) not between 1 and 60 or access_token is null or access_token!~'^[0-9a-f]{64}$' then return jsonb_build_object('error','INVALID_GROUP');end if;
 hashed:=encode(sha256(convert_to(access_token,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('janroku-group:'||request_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,0));
 if exists(select 1 from jr_group_private.admin_group_actions where action='delete' and (target_group=request_id or retired_token_fingerprint=encode(sha256(convert_to(hashed,'UTF8')),'hex'))) then return jsonb_build_object('error','GROUP_NOT_FOUND');end if;
 select * into existing from jr_group_private.groups where id=request_id;
 if existing.id is not null then
  if existing.token_hash<>hashed or existing.name<>clean then return jsonb_build_object('error','REQUEST_REUSED');end if;
  if existing.status<>'active' then return jsonb_build_object('error','GROUP_NOT_FOUND');end if;
  return jsonb_build_object('id',existing.id,'name',existing.name,'room_id',existing.id);
 end if;
 if not jr_group_private.jr_public_rate('groups-minute','minute',3) or not jr_group_private.jr_public_rate('groups-day','day',100) then return jsonb_build_object('error','RATE_LIMIT');end if;
 initial:=jsonb_build_object('version',1,'name',clean,'players','[]'::jsonb,'games','[]'::jsonb,'rules','{"start":25000,"returnScore":30000,"uma":[20,10,-10,-20],"oka":true,"okaWeights":[1,0,0,0],"tie":"split","rounding":"none"}'::jsonb);
 perform jr_group_private.jr_validate_state(initial);
 insert into jr_group_private.groups(id,name,token_hash) values(request_id,clean,hashed);
 insert into jr_group_private.rooms(id,group_id,state) values(request_id,request_id,initial);
 insert into jr_group_private.jr_public_events(room_id,version) values(request_id,1);
 return jsonb_build_object('id',request_id,'name',clean,'room_id',request_id);
end;$$;
-- Deleted short URLs must never be reassigned, even after a random collision.
create or replace function jr_group_private.ensure_short_link(target uuid) returns text
language plpgsql security definer set search_path='' as $$
declare result text;candidate text;
begin
 perform pg_advisory_xact_lock(hashtextextended('janroku-link:'||target::text,0));
 select short_id into result from jr_group_private.group_links where group_id=target;
 if result is not null then return result;end if;
 for attempt in 1..10 loop
  candidate:=translate(encode(substring(sha256(convert_to(gen_random_uuid()::text,'UTF8')) from 1 for 12),'base64'),'+/','-_');
  if exists(select 1 from jr_group_private.admin_group_actions where action='delete' and retired_short_id=candidate) then continue;end if;
  insert into jr_group_private.group_links(group_id,short_id) values(target,candidate) on conflict do nothing returning short_id into result;
  if result is not null then return result;end if;
 end loop;
 raise exception 'LINK_CREATION_FAILED';
end;$$;
revoke all on function jr_group_private.current_group(),jr_group_private.require_editor(),jr_group_private.group_snapshot(uuid),jr_group_private.snapshot_counts(jsonb) from public,anon,authenticated;
revoke all on function public.jr_admin_group_preview(uuid),public.jr_admin_group_status(uuid,text,text),public.jr_admin_group_export(uuid),public.jr_admin_group_delete(uuid,uuid,text,uuid,boolean) from public,anon;
grant execute on function public.jr_admin_group_preview(uuid),public.jr_admin_group_status(uuid,text,text),public.jr_admin_group_export(uuid),public.jr_admin_group_delete(uuid,uuid,text,uuid,boolean) to authenticated;
revoke all on function public.jr_admin_lifecycle_status() from public;
grant execute on function public.jr_admin_lifecycle_status() to anon,authenticated;
-- Issuance totals retain tombstones, while active usage excludes disabled groups.
create or replace function public.jr_admin_stats() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;month_start timestamptz:=(date_trunc('month',now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo');retired bigint;retired_month bigint;
begin
 perform jr_group_private.require_admin();
 select count(*),count(*) filter(where group_created_at>=month_start) into retired,retired_month from jr_group_private.admin_group_actions where action='delete';
 select jsonb_build_object('total_groups',count(*)+retired,'new_this_month',count(*) filter(where created_at>=month_start)+retired_month,
 'active_groups',count(*) filter(where status='active' and last_game_update_at>=now()-interval '30 days'),
 'total_games',coalesce(sum(game_count),0),'deletion_candidates',count(*) filter(where last_game_update_at<now()-interval '2 years')) into result from jr_group_private.group_management;
 return result;
end;$$;
notify pgrst,'reload schema';
commit;
