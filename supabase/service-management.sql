-- Apply AFTER groups.sql. Additive migration; no game data is deleted or rewritten.
begin;
create table if not exists jr_group_private.group_links(
 group_id uuid primary key references jr_group_private.groups(id),
 short_id text not null unique check(short_id ~ '^[A-Za-z0-9_-]{16}$'),
 created_at timestamptz not null default now()
);
alter table jr_group_private.group_links enable row level security;
revoke all on jr_group_private.group_links from public,anon,authenticated;

create or replace function jr_group_private.ensure_short_link(target uuid) returns text
language plpgsql security definer set search_path='' as $$
declare result text; candidate text;
begin
 perform pg_advisory_xact_lock(hashtextextended('janroku-link:'||target::text,0));
 select short_id into result from jr_group_private.group_links where group_id=target;
 if result is not null then return result;end if;
 for attempt in 1..10 loop
  -- Hash a CSPRNG UUID before truncation: 96 output bits, no UUID version-bit bias.
  candidate:=translate(encode(substring(sha256(convert_to(gen_random_uuid()::text,'UTF8')) from 1 for 12),'base64'),'+/','-_');
  insert into jr_group_private.group_links(group_id,short_id) values(target,candidate) on conflict do nothing returning short_id into result;
  if result is not null then return result;end if;
 end loop;
 raise exception 'LINK_CREATION_FAILED';
end;$$;
revoke all on function jr_group_private.ensure_short_link(uuid) from public,anon,authenticated;
-- Issue an alias transactionally even when an older client creates the group.
create or replace function jr_group_private.assign_group_link() returns trigger
language plpgsql security definer set search_path='' as $$begin
 perform jr_group_private.ensure_short_link(NEW.id);return NEW;
end;$$;
revoke all on function jr_group_private.assign_group_link() from public,anon,authenticated;
drop trigger if exists jr_assign_group_link on jr_group_private.groups;
create trigger jr_assign_group_link after insert on jr_group_private.groups
 for each row execute function jr_group_private.assign_group_link();
-- Existing groups receive aliases; their tokens, names and records stay unchanged.
do $$declare item record;begin for item in select id from jr_group_private.groups loop perform jr_group_private.ensure_short_link(item.id);end loop;end;$$;

create or replace function jr_group_private.current_group() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare headers jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 token text:=nullif(headers->>'x-janroku-group',''); link text:=nullif(headers->>'x-janroku-view','');
 editor_group uuid; view_group uuid;
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
 if coalesce(editor_group,view_group) is null then raise exception 'GROUP_NOT_FOUND' using errcode='42501';end if;
 return coalesce(editor_group,view_group);
end;$$;
create or replace function jr_group_private.require_editor() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare target uuid:=jr_group_private.current_group();token text:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-janroku-group';
begin
 if token is null or token!~'^[0-9a-f]{64}$' or not exists(select 1 from jr_group_private.groups where id=target and token_hash=encode(sha256(convert_to(token,'UTF8')),'hex')) then raise exception 'READ_ONLY' using errcode='42501';end if;
 return target;
end;$$;
revoke all on function jr_group_private.current_group(),jr_group_private.require_editor() from public,anon,authenticated;

create or replace function public.jr_group_apply(target uuid,request_id uuid,device_id uuid,operation jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 perform jr_group_private.require_editor();return jr_group_private.jr_public_apply(target,request_id,device_id,operation);
end;$$;
create or replace function public.jr_group_tournament_create(request_id uuid,device_id uuid,initial_state jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 perform jr_group_private.require_editor();return jr_group_private.jr_public_create(request_id,device_id,initial_state);
end;$$;
create or replace function public.jr_group_short_link() returns jsonb
language plpgsql security definer set search_path='' as $$begin
 return jsonb_build_object('short_id',jr_group_private.ensure_short_link(jr_group_private.require_editor()));
end;$$;
create or replace function public.jr_group_links_status() returns jsonb
language sql stable set search_path='' as $$select '{"version":1}'::jsonb;$$;
revoke all on function public.jr_group_apply(uuid,uuid,uuid,jsonb),public.jr_group_tournament_create(uuid,uuid,jsonb),public.jr_group_short_link(),public.jr_group_links_status() from public;
grant execute on function public.jr_group_apply(uuid,uuid,uuid,jsonb),public.jr_group_tournament_create(uuid,uuid,jsonb),public.jr_group_short_link(),public.jr_group_links_status() to anon,authenticated;
-- Management metadata: no existing room state, score, history or token is rewritten.
alter table jr_group_private.groups add column if not exists status text not null default 'active';
alter table jr_group_private.groups add column if not exists last_game_update_at timestamptz;
create index if not exists jr_groups_created on jr_group_private.groups(created_at desc,id);
create table if not exists jr_group_private.admin_users(
 user_id uuid primary key references auth.users(id),created_at timestamptz not null default now()
);
alter table jr_group_private.admin_users enable row level security;
revoke all on jr_group_private.admin_users from public,anon,authenticated;
create or replace function jr_group_private.track_game_activity() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if TG_OP='INSERT' then
  if jsonb_array_length(NEW.state->'games')=0 then return NEW;end if;
 elsif NEW.state->'games' is not distinct from OLD.state->'games' then return NEW;
 end if;
 update jr_group_private.groups set last_game_update_at=statement_timestamp() where id=NEW.group_id;
 return NEW;
end;$$;
drop trigger if exists jr_track_game_activity on jr_group_private.rooms;
create trigger jr_track_game_activity after insert or update of state on jr_group_private.rooms
 for each row execute function jr_group_private.track_game_activity();
revoke all on function jr_group_private.track_game_activity() from public,anon,authenticated;

create or replace view jr_group_private.group_management as
 select g.id,g.name,g.created_at,g.status,l.short_id,
 greatest(g.last_game_update_at,a.last_game_update_at,r.estimated_update_at) last_game_update_at,
 (r.estimated_update_at is not null and r.estimated_update_at>coalesce(g.last_game_update_at,'-infinity'::timestamptz) and r.estimated_update_at>coalesce(a.last_game_update_at,'-infinity'::timestamptz)) activity_estimated,
 coalesce(r.game_count,0) game_count,coalesce(p.player_count,0) player_count
 from jr_group_private.groups g join jr_group_private.group_links l on l.group_id=g.id
 left join lateral (
  select sum(jsonb_array_length(state->'games'))::bigint game_count,
   max(updated_at) filter(where jsonb_array_length(state->'games')>0 and not exists(select 1 from jr_group_private.jr_public_changes c where c.room_id=rooms.id and c.kind='game')) estimated_update_at
  from jr_group_private.rooms rooms where group_id=g.id
 ) r on true
 left join lateral (
  select max(c.created_at) last_game_update_at from jr_group_private.jr_public_changes c
  join jr_group_private.rooms room on room.id=c.room_id where room.group_id=g.id and c.kind='game'
 ) a on true
 left join lateral (
  select count(distinct trim(player->>'name'))::bigint player_count from jr_group_private.rooms room
  cross join lateral jsonb_array_elements(room.state->'players') player where room.group_id=g.id
 ) p on true;
revoke all on jr_group_private.group_management from public,anon,authenticated;
create or replace function jr_group_private.require_admin() returns void
language plpgsql stable security definer set search_path='' as $$
declare claims jsonb:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
begin
 if claims->>'role' is distinct from 'authenticated' or claims->>'aal' is distinct from 'aal2' or auth.uid() is null or not exists(select 1 from jr_group_private.admin_users where user_id=auth.uid()) then
  raise exception 'ADMIN_REQUIRED' using errcode='42501';
 end if;
end;$$;
revoke all on function jr_group_private.require_admin() from public,anon,authenticated;
create or replace function public.jr_admin_stats() returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 perform jr_group_private.require_admin();
 return (select jsonb_build_object('total_groups',count(*),'new_this_month',count(*) filter(where created_at >= (date_trunc('month',now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo')),
 'active_groups',count(*) filter(where last_game_update_at>=now()-interval '30 days'),'total_games',coalesce(sum(game_count),0),
 'deletion_candidates',count(*) filter(where last_game_update_at<now()-interval '2 years')) from jr_group_private.group_management);
end;$$;
create or replace function public.jr_admin_groups(page_offset int default 0,page_size int default 50,search_text text default '',candidates_only boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 perform jr_group_private.require_admin();
 return jsonb_build_object('total',(select count(*) from jr_group_private.group_management where position(lower(left(coalesce(search_text,''),60)) in lower(name))>0 and (not candidates_only or last_game_update_at<now()-interval '2 years')),
 'groups',(select coalesce(jsonb_agg(to_jsonb(item)),'[]') from (
 select *,coalesce(last_game_update_at<now()-interval '2 years',false) deletion_candidate
 from jr_group_private.group_management where position(lower(left(coalesce(search_text,''),60)) in lower(name))>0
 and (not candidates_only or last_game_update_at<now()-interval '2 years')
 order by created_at desc,id offset greatest(page_offset,0) limit least(greatest(page_size,1),100)
 ) item));
end;$$;
revoke all on function public.jr_admin_stats(),public.jr_admin_groups(int,int,text,boolean) from public,anon;
grant execute on function public.jr_admin_stats(),public.jr_admin_groups(int,int,text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
