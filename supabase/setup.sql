-- 雀録: Run this complete file in the Supabase SQL Editor.
-- Only authenticated room members can read; writes are validated RPCs with CAS.
begin;
create table if not exists public.jr_rooms (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 state jsonb not null, version bigint not null default 1, updated_at timestamptz not null default now()
);
create table if not exists public.jr_members (
 room_id uuid not null references public.jr_rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 primary key(room_id,user_id)
);
create table if not exists public.jr_invites (
 room_id uuid primary key references public.jr_rooms(id) on delete cascade,
 code text unique not null default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','')
);
create table if not exists public.jr_audit (
 id bigint generated always as identity primary key,
 room_id uuid not null references public.jr_rooms(id) on delete cascade,
 actor_id uuid not null, version bigint not null, previous_state jsonb not null,
 changed_at timestamptz not null default now()
);
alter table public.jr_rooms enable row level security;
alter table public.jr_members enable row level security;
alter table public.jr_invites enable row level security;
alter table public.jr_audit enable row level security;
create or replace function public.jr_is_member(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.jr_members where room_id=target and user_id=auth.uid());
$$;
revoke all on function public.jr_is_member(uuid) from public;
grant execute on function public.jr_is_member(uuid) to authenticated;
drop policy if exists jr_member_read on public.jr_rooms;
create policy jr_member_read on public.jr_rooms for select to authenticated using(public.jr_is_member(id));
drop policy if exists jr_self_read on public.jr_members;
create policy jr_self_read on public.jr_members for select to authenticated using(user_id=auth.uid());
drop policy if exists jr_audit_read on public.jr_audit;
create policy jr_audit_read on public.jr_audit for select to authenticated using(public.jr_is_member(room_id));
revoke all on public.jr_rooms,public.jr_members,public.jr_invites,public.jr_audit from anon,authenticated;
grant select on public.jr_rooms,public.jr_members,public.jr_audit to authenticated;

create or replace function public.jr_validate_rules(r jsonb) returns void
language plpgsql set search_path='' as $$
declare n numeric; total numeric:=0; v jsonb;
begin
 if jsonb_typeof(r)<>'object' or not(r ?& array['start','returnScore','uma','oka','okaWeights','tie','rounding']) then raise exception 'INVALID_RULES'; end if;
 foreach v in array array[r->'start',r->'returnScore'] loop
  if jsonb_typeof(v)<>'number' then raise exception 'INVALID_RULES'; end if;
  n:=v::text::numeric; if n<>trunc(n) or n<=0 or n>1000000 then raise exception 'INVALID_RULES'; end if;
 end loop;
 if jsonb_typeof(r->'oka')<>'boolean' or r->>'tie' not in ('split','seat') or r->>'rounding' not in ('none','round','floor') then raise exception 'INVALID_RULES'; end if;
 if jsonb_typeof(r->'uma')<>'array' or jsonb_array_length(r->'uma')<>4 or jsonb_typeof(r->'okaWeights')<>'array' or jsonb_array_length(r->'okaWeights')<>4 then raise exception 'INVALID_RULES'; end if;
 for v in select value from jsonb_array_elements(r->'uma') loop
  if jsonb_typeof(v)<>'number' or abs(v::text::numeric)>10000 then raise exception 'INVALID_RULES'; end if;
 end loop;
 for v in select value from jsonb_array_elements(r->'okaWeights') loop
  if jsonb_typeof(v)<>'number' then raise exception 'INVALID_RULES'; end if;
  n:=v::text::numeric; if n<0 or n>1 then raise exception 'INVALID_RULES'; end if;total:=total+n;
 end loop;
 if abs(total-1)>0.00000001 then raise exception 'INVALID_RULES'; end if;
end;$$;

create or replace function public.jr_validate_result(rows_data jsonb,r jsonb,mode text,players jsonb) returns void
language plpgsql set search_path='' as $$
declare row_data jsonb; n numeric; total numeric:=0; i int:=0; k int; first_rank int; tie_count int; expected_rank int; expected numeric; bonus numeric; last_rank int:=0; rank_no int; seat_no int;
begin
 perform public.jr_validate_rules(r);
 if mode not in ('score','points') or jsonb_typeof(rows_data)<>'array' or jsonb_array_length(rows_data)<>4 then raise exception 'INVALID_RESULT'; end if;
 if (select count(distinct value->>'playerId') from jsonb_array_elements(rows_data))<>4 then raise exception 'INVALID_PLAYERS'; end if;
 for row_data in select value from jsonb_array_elements(rows_data) loop
  if not exists(select 1 from jsonb_array_elements(players) p where p->>'id'=row_data->>'playerId') then raise exception 'INVALID_PLAYERS'; end if;
  if jsonb_typeof(row_data->'rank') is distinct from 'number' or jsonb_typeof(row_data->'point') is distinct from 'number' then raise exception 'INVALID_RESULT'; end if;
  n:=(row_data->>'rank')::numeric;if n<>trunc(n) or n<1 or n>4 then raise exception 'INVALID_RANK'; end if;
  n:=(row_data->>'point')::numeric;if abs(n)>1000000 or n<>round(n,4) then raise exception 'INVALID_POINT'; end if;
  if row_data ? 'seat' then
   if jsonb_typeof(row_data->'seat')<>'number' then raise exception 'INVALID_SEAT'; end if;
   n:=(row_data->>'seat')::numeric;if n<>trunc(n) or n<0 or n>3 then raise exception 'INVALID_SEAT'; end if;
  end if;
  if mode='score' then
   if jsonb_typeof(row_data->'score') is distinct from 'number' then raise exception 'INVALID_SCORE'; end if;
   n:=(row_data->>'score')::numeric;if n<>trunc(n) or abs(n)>1000000 then raise exception 'INVALID_SCORE'; end if;total:=total+n;
  elsif row_data->'score' is distinct from 'null'::jsonb then raise exception 'INVALID_SCORE';
  end if;
 end loop;
 if mode='points' then
  for row_data in select value from jsonb_array_elements(rows_data) order by (value->>'rank')::int loop
   i:=i+1;rank_no:=(row_data->>'rank')::int;
   if (i=1 and rank_no<>1) or (rank_no<>last_rank and rank_no<>i) or (r->>'tie'='seat' and rank_no<>i) then raise exception 'INVALID_RANK'; end if;
   last_rank:=rank_no;
  end loop;
  return;
 end if;
 if total<>(r->>'start')::numeric*4 then raise exception 'INVALID_TOTAL'; end if;
 if (select count(distinct coalesce((value->>'seat')::int, ordinality::int-1)) from jsonb_array_elements(rows_data) with ordinality)<>4 then raise exception 'INVALID_SEAT'; end if;
 for row_data in select value from jsonb_array_elements(rows_data) with ordinality order by (value->>'score')::numeric desc, coalesce((value->>'seat')::int,ordinality::int-1) loop
  i:=i+1;n:=(row_data->>'score')::numeric;
  select 1+count(*) into first_rank from jsonb_array_elements(rows_data) where (value->>'score')::numeric>n;
  select count(*) into tie_count from jsonb_array_elements(rows_data) where (value->>'score')::numeric=n;
  expected_rank:=case when r->>'tie'='split' then first_rank else i end;
  if (row_data->>'rank')::int<>expected_rank then raise exception 'INVALID_RANK'; end if;
  bonus:=0;
  for k in (case when r->>'tie'='split' then first_rank else i end)..(case when r->>'tie'='split' then first_rank+tie_count-1 else i end) loop
   bonus:=bonus+(r->'uma'->>(k-1))::numeric;
   if (r->>'oka')::boolean then bonus:=bonus+((r->>'returnScore')::numeric-(r->>'start')::numeric)*4/1000*(r->'okaWeights'->>(k-1))::numeric; end if;
  end loop;
  if r->>'tie'='split' then bonus:=bonus/tie_count; end if;
  expected:=(n-(r->>'returnScore')::numeric)/1000+bonus;
  if r->>'rounding'='round' then expected:=floor(expected+0.5); elsif r->>'rounding'='floor' then expected:=floor(expected); end if;
  if (row_data->>'point')::numeric<>round(expected,4) then raise exception 'INVALID_CALCULATED_POINT'; end if;
 end loop;
end;$$;

create or replace function public.jr_validate_state(s jsonb) returns void
language plpgsql set search_path='' as $$
declare p jsonb;g jsonb;rev jsonb;d text;
begin
 if s is null or octet_length(s::text)>2097152 or jsonb_typeof(s)<>'object' or s->>'version' is distinct from '1' or jsonb_typeof(s->'name') is distinct from 'string' or length(s->>'name')>60 or jsonb_typeof(s->'players') is distinct from 'array' or jsonb_typeof(s->'games') is distinct from 'array' then raise exception 'INVALID_STATE'; end if;
 if jsonb_array_length(s->'players')>100 or jsonb_array_length(s->'games')>10000 then raise exception 'LIMIT_EXCEEDED'; end if;
 perform public.jr_validate_rules(s->'rules');
 for p in select value from jsonb_array_elements(s->'players') loop
  if jsonb_typeof(p->'id') is distinct from 'string' or length(p->>'id') not between 1 and 100 or jsonb_typeof(p->'name') is distinct from 'string' or length(trim(p->>'name')) not between 1 and 30 then raise exception 'INVALID_PLAYERS'; end if;
 end loop;
 if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(s->'players')) then raise exception 'INVALID_PLAYERS'; end if;
 if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(s->'games')) then raise exception 'INVALID_GAME'; end if;
 for g in select value from jsonb_array_elements(s->'games') loop
  if jsonb_typeof(g->'id') is distinct from 'string' or length(g->>'id') not between 1 and 100 or jsonb_typeof(g->'table') is distinct from 'string' or length(g->>'table')>20 or jsonb_typeof(g->'date') is distinct from 'string' or jsonb_typeof(g->'revisions') is distinct from 'array' or jsonb_array_length(g->'revisions')>1000 then raise exception 'INVALID_GAME'; end if;
  perform (g->>'date')::timestamptz;
  if g ? 'playedOn' then
   d:=g->>'playedOn';if d is null or d!~'^\d{4}-\d{2}-\d{2}$' or d<'1900-01-01' or d>'9999-12-31' or to_char(d::date,'YYYY-MM-DD')<>d then raise exception 'INVALID_DATE'; end if;
  end if;
  perform public.jr_validate_result(g->'rows',g->'rules',coalesce(g->>'inputMode','score'),s->'players');
  for rev in select value from jsonb_array_elements(g->'revisions') loop
   perform (rev->>'date')::timestamptz;
   perform public.jr_validate_result(rev->'rows',rev->'rules',coalesce(rev->>'inputMode','score'),s->'players');
  end loop;
 end loop;
end;$$;

create or replace function public.jr_create_room(initial_state jsonb) returns public.jr_rooms
language plpgsql security definer set search_path='' as $$
declare room public.jr_rooms;
begin
 if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
 if (select count(*) from public.jr_rooms where owner_id=auth.uid())>=10 then raise exception 'ROOM_LIMIT'; end if;
 perform public.jr_validate_state(initial_state);
 insert into public.jr_rooms(owner_id,state) values(auth.uid(),initial_state) returning * into room;
 insert into public.jr_members values(room.id,auth.uid());
 insert into public.jr_invites(room_id) values(room.id);
 return room;
end;$$;
create or replace function public.jr_join_room(invite_code text) returns public.jr_rooms
language plpgsql security definer set search_path='' as $$
declare target uuid;room public.jr_rooms;
begin
 if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
 select room_id into target from public.jr_invites where code=invite_code;
 if target is null then raise exception 'INVALID_INVITE'; end if;
 insert into public.jr_members values(target,auth.uid()) on conflict do nothing;
 select * into room from public.jr_rooms where id=target;return room;
end;$$;
create or replace function public.jr_invite_code(target uuid,rotate boolean default false) returns text
language plpgsql security definer set search_path='' as $$
declare code_value text;
begin
 if not exists(select 1 from public.jr_rooms where id=target and owner_id=auth.uid()) then raise exception 'OWNER_ONLY'; end if;
 if rotate then update public.jr_invites set code=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','') where room_id=target; end if;
 select code into code_value from public.jr_invites where room_id=target;return code_value;
end;$$;
create or replace function public.jr_save_room(target uuid,expected_version bigint,next_state jsonb) returns public.jr_rooms
language plpgsql security definer set search_path='' as $$
declare room public.jr_rooms;g jsonb;old_game jsonb;
begin
 if not public.jr_is_member(target) then raise exception 'MEMBER_REQUIRED'; end if;
 select * into room from public.jr_rooms where id=target for update;
 if room.owner_id<>auth.uid() then raise exception 'OWNER_ONLY'; end if;
 if room.version<>expected_version then raise exception 'VERSION_CONFLICT'; end if;
 if room.owner_id<>auth.uid() and (room.state->'rules' is distinct from next_state->'rules' or room.state->'name' is distinct from next_state->'name') then raise exception 'OWNER_ONLY'; end if;
 perform public.jr_validate_state(next_state);
 for g in select value from jsonb_array_elements(next_state->'games') loop
  select value into old_game from jsonb_array_elements(room.state->'games') where value->>'id'=g->>'id';
  if old_game is null and g->'rules' is distinct from room.state->'rules' then raise exception 'INVALID_GAME_RULES'; end if;
  if room.owner_id<>auth.uid() and old_game is not null and g->'rules' is distinct from old_game->'rules' then raise exception 'OWNER_ONLY'; end if;
 end loop;
 insert into public.jr_audit(room_id,actor_id,version,previous_state) values(target,auth.uid(),room.version,room.state);
 update public.jr_rooms set state=next_state,version=version+1,updated_at=now() where id=target returning * into room;
 return room;
end;$$;
revoke all on function public.jr_validate_rules(jsonb),public.jr_validate_result(jsonb,jsonb,text,jsonb),public.jr_validate_state(jsonb) from public;
revoke all on function public.jr_create_room(jsonb),public.jr_join_room(text),public.jr_invite_code(uuid,boolean),public.jr_save_room(uuid,bigint,jsonb) from public;
grant execute on function public.jr_create_room(jsonb),public.jr_join_room(text),public.jr_invite_code(uuid,boolean),public.jr_save_room(uuid,bigint,jsonb) to authenticated;
-- Realtime respects the room SELECT policy. Invite codes are in a separate table.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='jr_rooms') then
  alter publication supabase_realtime add table public.jr_rooms;
 end if;
end $$;
commit;
