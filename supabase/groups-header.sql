-- Group sharing v1. Apply ONLY the generated groups.sql, not this fragment.
-- Additive isolated storage. No legacy tables, functions or rows are modified.
begin;
create schema if not exists jr_group_private;
revoke all on schema jr_group_private from public,anon,authenticated;
create table if not exists jr_group_private.groups (
 id uuid primary key, name text not null check(length(name) between 1 and 60),
 token_hash text not null unique, created_at timestamptz not null default now()
);
alter table jr_group_private.groups enable row level security;
create or replace function jr_group_private.current_group() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare token text; result uuid;
begin
 token:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-janroku-group';
 if token is null or token!~'^[0-9a-f]{64}$' then raise exception 'GROUP_NOT_FOUND' using errcode='42501';end if;
 select id into result from jr_group_private.groups where token_hash=encode(sha256(convert_to(token,'UTF8')),'hex');
 if result is null then raise exception 'GROUP_NOT_FOUND' using errcode='42501';end if;
 return result;
end;$$;
create table if not exists jr_group_private.rooms (
 id uuid primary key, group_id uuid not null default jr_group_private.current_group() references jr_group_private.groups(id),
 owner_id uuid, state jsonb not null, version bigint not null default 1,
 updated_at timestamptz not null default now(), is_public boolean not null default true, deleted_at timestamptz
);
alter table jr_group_private.rooms enable row level security;
create index if not exists jr_group_rooms_scope on jr_group_private.rooms(group_id,updated_at desc);
-- Every reused engine query sees only the current group. Inserts cannot escape it.
create or replace view jr_group_private.jr_rooms as
 select id,owner_id,state,version,updated_at,is_public,deleted_at from jr_group_private.rooms
 where group_id=jr_group_private.current_group() with cascaded check option;
create table if not exists jr_group_private.jr_public_events (
 room_id uuid primary key references jr_group_private.rooms(id), version bigint not null,updated_at timestamptz not null default now()
);
create table if not exists jr_group_private.jr_public_changes (
 id uuid primary key default gen_random_uuid(),room_id uuid not null references jr_group_private.rooms(id),
 version bigint not null,request_id uuid not null,device_id uuid not null,kind text not null,entity_id text not null,
 before_data jsonb,after_data jsonb,position int,restored_from uuid,created_at timestamptz not null default now()
);
create index if not exists jr_group_changes_room on jr_group_private.jr_public_changes(room_id,version desc);
create table if not exists jr_group_private.jr_public_requests (
 room_id uuid not null references jr_group_private.rooms(id),request_id uuid not null,operation jsonb not null,version bigint not null,primary key(room_id,request_id)
);
create table if not exists jr_group_private.jr_public_rates (
 bucket text not null,window_start timestamptz not null,counter int not null,primary key(bucket,window_start)
);
alter table jr_group_private.jr_public_events enable row level security;
alter table jr_group_private.jr_public_changes enable row level security;
alter table jr_group_private.jr_public_requests enable row level security;
alter table jr_group_private.jr_public_rates enable row level security;
