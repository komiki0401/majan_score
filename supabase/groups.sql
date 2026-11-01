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

-- Reuse the existing validation, calculation, conflict and audit engine in an isolated schema.
create or replace function jr_group_private.jr_public_visible(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from jr_group_private.jr_rooms where id=target and is_public);
$$;

create or replace function jr_group_private.jr_validate_rules(r jsonb) returns void
language plpgsql set search_path='' as $$
declare n numeric; total numeric:=0; v jsonb;
begin
 if jsonb_typeof(r) is distinct from 'object' or not(r ?& array['start','returnScore','uma','oka','okaWeights','tie','rounding']) then raise exception 'INVALID_RULES'; end if;
 foreach v in array array[r->'start',r->'returnScore'] loop
  if jsonb_typeof(v)<>'number' then raise exception 'INVALID_RULES'; end if;
  n:=v::text::numeric; if n<>trunc(n) or n<=0 or n>1000000 then raise exception 'INVALID_RULES'; end if;
 end loop;
 if jsonb_typeof(r->'oka')<>'boolean' or jsonb_typeof(r->'tie') is distinct from 'string' or jsonb_typeof(r->'rounding') is distinct from 'string' or r->>'tie' not in ('split','seat') or r->>'rounding' not in ('none','round','floor') then raise exception 'INVALID_RULES'; end if;
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

create or replace function jr_group_private.jr_validate_result(rows_data jsonb,r jsonb,mode text,players jsonb) returns void
language plpgsql set search_path='' as $$
declare row_data jsonb; n numeric; total numeric:=0; i int:=0; k int; first_rank int; tie_count int; expected_rank int; expected numeric; bonus numeric; last_rank int:=0; rank_no int; seat_no int;
begin
 perform jr_group_private.jr_validate_rules(r);
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

create or replace function jr_group_private.jr_validate_state(s jsonb) returns void
language plpgsql set search_path='' as $$
declare p jsonb;g jsonb;rev jsonb;d text;
begin
 if s is null or octet_length(s::text)>2097152 or jsonb_typeof(s)<>'object' or s->>'version' is distinct from '1' or jsonb_typeof(s->'name') is distinct from 'string' or length(s->>'name')>60 or jsonb_typeof(s->'players') is distinct from 'array' or jsonb_typeof(s->'games') is distinct from 'array' then raise exception 'INVALID_STATE'; end if;
 if jsonb_array_length(s->'players')>100 or jsonb_array_length(s->'games')>10000 then raise exception 'LIMIT_EXCEEDED'; end if;
 perform jr_group_private.jr_validate_rules(s->'rules');
 for p in select value from jsonb_array_elements(s->'players') loop
  if jsonb_typeof(p->'id') is distinct from 'string' or length(p->>'id') not between 1 and 100 or jsonb_typeof(p->'name') is distinct from 'string' or length(p->>'name') not between 1 and 30 or length(trim(p->>'name'))=0 then raise exception 'INVALID_PLAYERS'; end if;
 end loop;
 if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(s->'players')) then raise exception 'INVALID_PLAYERS'; end if;
 if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(s->'games')) then raise exception 'INVALID_GAME'; end if;
 for g in select value from jsonb_array_elements(s->'games') loop
  if jsonb_typeof(g->'id') is distinct from 'string' or length(g->>'id') not between 1 and 100 or jsonb_typeof(g->'table') is distinct from 'string' or length(g->>'table')>20 or jsonb_typeof(g->'date') is distinct from 'string' or jsonb_typeof(g->'revisions') is distinct from 'array' or jsonb_array_length(g->'revisions')>1000 then raise exception 'INVALID_GAME'; end if;
  perform (g->>'date')::timestamptz;
  if g ? 'playedOn' then
   d:=g->>'playedOn';if d is null or d!~'^\d{4}-\d{2}-\d{2}$' or d<'1900-01-01' or d>'9999-12-31' or to_char(d::date,'YYYY-MM-DD')<>d then raise exception 'INVALID_DATE'; end if;
  end if;
  perform jr_group_private.jr_validate_result(g->'rows',g->'rules',coalesce(g->>'inputMode','score'),s->'players');
  for rev in select value from jsonb_array_elements(g->'revisions') loop
   perform (rev->>'date')::timestamptz;
   perform jr_group_private.jr_validate_result(rev->'rows',rev->'rules',coalesce(rev->>'inputMode','score'),s->'players');
  end loop;
 end loop;
end;$$;

create or replace function jr_group_private.jr_public_rate(bucket_name text,period text,max_count int) returns boolean
language plpgsql security definer set search_path='' as $$
declare result int; stamp timestamptz:=date_trunc(period,now() at time zone 'UTC') at time zone 'UTC';
begin
 insert into jr_group_private.jr_public_rates values(bucket_name,stamp,1)
 on conflict(bucket,window_start) do update set counter=jr_group_private.jr_public_rates.counter+1
 where jr_group_private.jr_public_rates.counter<max_count returning counter into result;
 return result is not null;
end;$$;

create or replace function jr_group_private.jr_public_data(target uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'state',state,'version',version,'updated_at',updated_at,'deleted_at',deleted_at)
 from jr_group_private.jr_rooms where id=target and is_public;
$$;

create or replace function jr_group_private.jr_public_round(games jsonb,target jsonb) returns int
language plpgsql set search_path='' as $$
declare g jsonb;n int:=0;
begin
 if target ? 'round' then return (target->>'round')::int; end if;
 for g in select value from jsonb_array_elements(games) loop
  if coalesce(g->>'playedOn',left(g->>'date',10))=coalesce(target->>'playedOn',left(target->>'date',10)) and g->>'table'=target->>'table' then n:=n+1; end if;
  if g->>'id'=target->>'id' then return n; end if;
 end loop;
 return n+1;
end;$$;

create or replace function jr_group_private.jr_public_array_set(items jsonb,target text,new_value jsonb,pos int default null) returns jsonb
language plpgsql set search_path='' as $$
declare result jsonb:='[]';v jsonb;found boolean:=false;i int:=0;
begin
 for v in select value from jsonb_array_elements(items) loop
  if v->>'id'=target then
   found:=true;if new_value is not null then result:=result||jsonb_build_array(new_value); end if;
  else result:=result||jsonb_build_array(v); end if;
 end loop;
 if not found and new_value is not null then
  if pos is not null and pos>=0 and pos<jsonb_array_length(result) then
   result:=jsonb_insert(result,array[pos::text],new_value);
  else result:=result||jsonb_build_array(new_value); end if;
 end if;
 return result;
end;$$;

create or replace function jr_group_private.jr_public_calculate(g jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare r jsonb:=g->'rules';rows_data jsonb:=g->'rows';row_data jsonb;result jsonb:='[]';n numeric;i int:=0;k int;first_rank int;ties int;rank_no int;bonus numeric;point numeric;seat_no int;
begin
 if coalesce(g->>'inputMode','score')='points' then return g; end if;
 perform jr_group_private.jr_validate_rules(r);
 if jsonb_typeof(rows_data) is distinct from 'array' or jsonb_array_length(rows_data)<>4 then raise exception 'INVALID_RESULT'; end if;
 for row_data in select value from jsonb_array_elements(rows_data) loop
  if jsonb_typeof(row_data->'score') is distinct from 'number' or (row_data->>'score')::numeric<>trunc((row_data->>'score')::numeric) or abs((row_data->>'score')::numeric)>1000000 then raise exception 'INVALID_SCORE'; end if;
 end loop;
 for row_data,seat_no in select value,coalesce((value->>'seat')::int,ordinality::int-1) from jsonb_array_elements(rows_data) with ordinality order by (value->>'score')::numeric desc,coalesce((value->>'seat')::int,ordinality::int-1) loop
  i:=i+1;n:=(row_data->>'score')::numeric;
  select 1+count(*) into first_rank from jsonb_array_elements(rows_data) where (value->>'score')::numeric>n;
  select count(*) into ties from jsonb_array_elements(rows_data) where (value->>'score')::numeric=n;
  rank_no:=case when r->>'tie'='split' then first_rank else i end;bonus:=0;
  for k in (case when r->>'tie'='split' then first_rank else i end)..(case when r->>'tie'='split' then first_rank+ties-1 else i end) loop
   bonus:=bonus+(r->'uma'->>(k-1))::numeric;
   if (r->>'oka')::boolean then bonus:=bonus+((r->>'returnScore')::numeric-(r->>'start')::numeric)*4/1000*(r->'okaWeights'->>(k-1))::numeric;end if;
  end loop;
  if r->>'tie'='split' then bonus:=bonus/ties;end if;
  point:=(n-(r->>'returnScore')::numeric)/1000+bonus;
  if r->>'rounding'='round' then point:=floor(point+0.5);elsif r->>'rounding'='floor' then point:=floor(point);end if;
  result:=result||jsonb_build_array(jsonb_build_object('playerId',row_data->>'playerId','seat',seat_no,'score',n,'rank',rank_no,'point',round(point,4)));
 end loop;
 return jsonb_set(g,'{rows}',result);
end;$$;

create or replace function jr_group_private.jr_public_list(include_archived boolean default false) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(data order by stamp desc),'[]') from (
  select jsonb_build_object('id',id,'name',state->>'name','players',jsonb_array_length(state->'players'),'games',jsonb_array_length(state->'games'),'version',version,'updated_at',updated_at,'deleted_at',deleted_at) data,updated_at stamp
  from jr_group_private.jr_rooms where is_public and (include_archived or deleted_at is null) order by updated_at desc limit 100
 ) r;
$$;

create or replace function jr_group_private.jr_public_room(target uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jr_group_private.jr_public_data(target),jsonb_build_object('error','NOT_FOUND'));
$$;

create or replace function jr_group_private.jr_public_create(request_id uuid,device_id uuid,initial_state jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare room_id uuid:=request_id; saved jsonb;g jsonb;normalized jsonb:='[]';s jsonb;
begin
 if request_id is null then return jsonb_build_object('error','INVALID_OPERATION');end if;
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,0));
 select r.operation into saved from jr_group_private.jr_public_requests r where r.room_id=jr_public_create.request_id and r.request_id=jr_public_create.request_id;
 if saved is not null then
  if saved is distinct from initial_state then return jsonb_build_object('error','REQUEST_REUSED');end if;
  return jr_group_private.jr_public_data(room_id);
 end if;
 if device_id is null or initial_state is null or octet_length(initial_state::text)>2097152 then return jsonb_build_object('error','INVALID_STATE');end if;
 if not jr_group_private.jr_public_rate('create-minute','minute',3) or not jr_group_private.jr_public_rate('create-day','day',20) then return jsonb_build_object('error','RATE_LIMIT');end if;
 begin
  if (select count(*) from jr_group_private.jr_rooms where is_public and deleted_at is null)>=100 then raise exception 'ROOM_LIMIT';end if;
  if exists(select 1 from jr_group_private.jr_rooms where id=room_id) then raise exception 'REQUEST_REUSED';end if;
  perform jr_group_private.jr_validate_state(initial_state);
  for g in select value from jsonb_array_elements(initial_state->'games') loop
   normalized:=normalized||jsonb_build_array(jr_group_private.jr_public_calculate(case when g ? 'round' then g else jsonb_set(g,'{round}',to_jsonb(jr_group_private.jr_public_round(initial_state->'games',g))) end));
  end loop;
  s:=jsonb_set(initial_state,'{games}',normalized);perform jr_group_private.jr_validate_state(s);
  insert into jr_group_private.jr_rooms(id,owner_id,state,is_public) values(room_id,null,s,true);
  insert into jr_group_private.jr_public_events values(room_id,1,now());
  insert into jr_group_private.jr_public_requests values(room_id,request_id,initial_state,1);
  return jr_group_private.jr_public_data(room_id);
 exception when others then return jsonb_build_object('error',SQLERRM);
 end;
end;$$;

create or replace function jr_group_private.jr_public_apply(target uuid,request_id uuid,device_id uuid,operation jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare room jr_group_private.jr_rooms;receipt jsonb;changes jsonb;c jsonb;kind text;entity text;before_value jsonb;after_value jsonb;current_value jsonb;new_state jsonb;field text;pos int;source jr_group_private.jr_public_changes;archive timestamptz;new_version bigint;g jsonb;other_game jsonb;round_no int;did_change boolean:=false;new_changes jsonb:='[]';item jsonb;
begin
 if target is null or request_id is null or device_id is null or operation is null or octet_length(operation::text)>262144 then return jsonb_build_object('error','INVALID_OPERATION');end if;
 select * into room from jr_group_private.jr_rooms where id=target and is_public for update;
 if room.id is null then return jsonb_build_object('error','NOT_FOUND');end if;
 select r.operation into receipt from jr_group_private.jr_public_requests r where r.room_id=target and r.request_id=jr_public_apply.request_id;
 if receipt is not null then
  if receipt is distinct from operation then return jsonb_build_object('error','REQUEST_REUSED');end if;
  return jr_group_private.jr_public_data(target);
 end if;
 -- Global room limits cannot be bypassed by changing device IDs. Device ID is not identity.
 if not jr_group_private.jr_public_rate('all-writes-minute','minute',300)
  or not jr_group_private.jr_public_rate('all-writes-day','day',10000)
  or not jr_group_private.jr_public_rate('room-minute:'||target,'minute',60)
  or not jr_group_private.jr_public_rate('room-day:'||target,'day',2000)
  or not jr_group_private.jr_public_rate('device:'||target||':'||device_id,'minute',20)
 then return jsonb_build_object('error','RATE_LIMIT');end if;
 begin
  if operation ? 'restore' then
   select * into source from jr_group_private.jr_public_changes where id=(operation->>'restore')::uuid and room_id=target;
   if source.id is null then raise exception 'NOT_FOUND';end if;
   changes:=jsonb_build_array(jsonb_build_object('kind',source.kind,'id',source.entity_id,'before',source.after_data,'after',source.before_data,'position',source.position));
  else changes:=operation->'changes';end if;
  if jsonb_typeof(changes) is distinct from 'array' or jsonb_array_length(changes) not between 1 and 200 then raise exception 'INVALID_OPERATION';end if;
  if (select count(*)<>count(distinct ((value->>'kind')||':'||(value->>'id'))) from jsonb_array_elements(changes)) then raise exception 'INVALID_OPERATION';end if;
  new_state:=room.state;archive:=room.deleted_at;new_version:=room.version+1;
  for c in select value from jsonb_array_elements(changes) loop
   kind:=c->>'kind';entity:=c->>'id';pos:=null;field:=null;
   before_value:=nullif(c->'before','null'::jsonb);after_value:=nullif(c->'after','null'::jsonb);
   if kind is null or entity is null or length(entity) not between 1 and 100 then raise exception 'INVALID_OPERATION';end if;
   if room.deleted_at is not null and kind<>'archive' then raise exception 'ARCHIVED';end if;
   if kind in ('game','player') then
    field:=case when kind='game' then 'games' else 'players' end;
    select value,ordinality::int-1 into current_value,pos from jsonb_array_elements(new_state->field) with ordinality where value->>'id'=entity;
   elsif kind='settings' then
    current_value:=jsonb_build_object('name',new_state->'name','rules',new_state->'rules');
   elsif kind='archive' then current_value:=jsonb_build_object('deleted_at',archive);
   else raise exception 'INVALID_OPERATION';end if;
   if current_value is distinct from before_value then
    -- Identical logical writes do not create duplicates.
    if current_value is not distinct from after_value then continue;end if;
    raise exception 'VERSION_CONFLICT';
   end if;
   if current_value is not distinct from after_value then continue;end if;
   if field is not null then
    if after_value is not null then
     if jsonb_typeof(after_value) is distinct from 'object' or after_value->>'id' is distinct from entity then raise exception 'INVALID_OPERATION';end if;
     if kind='game' then
      if source.id is null then
       if current_value is null and after_value->'rules' is distinct from new_state->'rules' then raise exception 'RULES_CHANGED';end if;
       if current_value is not null and after_value->'rules' is distinct from current_value->'rules' then raise exception 'RULES_CHANGED';end if;
       if current_value is null then after_value:=jsonb_set(after_value,'{revisions}','[]');
       else after_value:=jsonb_set(after_value,'{date}',current_value->'date');after_value:=jsonb_set(after_value,'{revisions}',(current_value->'revisions')||jsonb_build_array(jsonb_build_object('date',now(),'playedOn',current_value->'playedOn','rows',current_value->'rows','rules',current_value->'rules','inputMode',coalesce(current_value->>'inputMode','score'))));end if;
      end if;
      after_value:=jr_group_private.jr_public_calculate(after_value);
      if jsonb_typeof(after_value->'round') is distinct from 'number' or (after_value->>'round')::numeric<>trunc((after_value->>'round')::numeric) or (after_value->>'round')::numeric not between 1 and 10000 then raise exception 'INVALID_ROUND';end if;
      round_no:=(after_value->>'round')::int;
      for other_game in select value from jsonb_array_elements(new_state->'games') where value->>'id'<>entity loop
       if other_game->>'table'=after_value->>'table' and coalesce(other_game->>'playedOn',left(other_game->>'date',10))=coalesce(after_value->>'playedOn',left(after_value->>'date',10)) and jr_group_private.jr_public_round(new_state->'games',other_game)=round_no then raise exception 'DUPLICATE_ROUND';end if;
      end loop;
     elsif current_value is null and exists(select 1 from jsonb_array_elements(new_state->'players') p where p->>'name'=after_value->>'name' and p->>'id'<>entity) then raise exception 'DUPLICATE_PLAYER';end if;
    end if;
    if pos is null and source.id is not null then pos:=source.position;end if;
    new_state:=jsonb_set(new_state,array[field],jr_group_private.jr_public_array_set(new_state->field,entity,after_value,pos));
   elsif kind='settings' then
    if jsonb_typeof(after_value) is distinct from 'object' or not(after_value ?& array['name','rules']) then raise exception 'INVALID_OPERATION';end if;
    new_state:=jsonb_set(jsonb_set(new_state,'{name}',after_value->'name'),'{rules}',after_value->'rules');
   else
    if jsonb_typeof(after_value) is distinct from 'object' or not(after_value ? 'deleted_at') then raise exception 'INVALID_OPERATION';end if;
    -- Browser can only archive; only the stored history can restore an archive.
    if source.id is null then archive:=now();after_value:=jsonb_build_object('deleted_at',archive);
    else archive:=nullif(after_value->>'deleted_at','')::timestamptz;end if;
   end if;
   new_changes:=new_changes||jsonb_build_array(jsonb_build_object('kind',kind,'id',entity,'before',current_value,'after',after_value,'position',pos));
   did_change:=true;
  end loop;
  perform jr_group_private.jr_validate_state(new_state);
  if did_change then
   update jr_group_private.jr_rooms set state=new_state,deleted_at=archive,version=new_version,updated_at=now() where id=target;
   for item in select value from jsonb_array_elements(new_changes) loop
    insert into jr_group_private.jr_public_changes(room_id,version,request_id,device_id,kind,entity_id,before_data,after_data,position,restored_from)
    values(target,new_version,request_id,device_id,item->>'kind',item->>'id',nullif(item->'before','null'::jsonb),nullif(item->'after','null'::jsonb),(item->>'position')::int,source.id);
   end loop;
   insert into jr_group_private.jr_public_events values(target,new_version,now()) on conflict(room_id) do update set version=excluded.version,updated_at=excluded.updated_at;
  end if;
  insert into jr_group_private.jr_public_requests values(target,request_id,operation,case when did_change then new_version else room.version end);
  return jr_group_private.jr_public_data(target);
 exception when others then return jsonb_build_object('error',SQLERRM);
 end;
end;$$;
-- Only these narrow entry points are exposed through PostgREST.
create or replace function public.jr_group_status() returns jsonb
language sql stable set search_path='' as $$ select '{"version":1}'::jsonb; $$;
create or replace function public.jr_group_info() returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 perform jr_group_private.current_group();
 return (select jsonb_build_object('id',id,'name',name) from jr_group_private.groups where id=jr_group_private.current_group());
end;$$;
create or replace function public.jr_group_list(include_archived boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin perform jr_group_private.current_group();return jr_group_private.jr_public_list(include_archived);end;$$;
create or replace function public.jr_group_room(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin perform jr_group_private.current_group();return jr_group_private.jr_public_room(target);end;$$;
create or replace function public.jr_group_apply(target uuid,request_id uuid,device_id uuid,operation jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 perform jr_group_private.current_group();
 return jr_group_private.jr_public_apply(target,request_id,device_id,operation);
end;$$;
create or replace function public.jr_group_tournament_create(request_id uuid,device_id uuid,initial_state jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 perform jr_group_private.current_group();
 return jr_group_private.jr_public_create(request_id,device_id,initial_state);
end;$$;
create or replace function public.jr_group_index(page_offset int default 0,page_size int default 500) returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 perform jr_group_private.current_group();
 return (select coalesce(jsonb_agg(to_jsonb(e)),'[]') from (
  select e.room_id,e.version,e.updated_at from jr_group_private.jr_public_events e join jr_group_private.jr_rooms r on r.id=e.room_id
  where r.is_public order by e.room_id offset greatest(page_offset,0) limit least(greatest(page_size,1),500)
 ) e);
end;$$;
create or replace function public.jr_group_changes(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 perform jr_group_private.current_group();
 return (select coalesce(jsonb_agg(to_jsonb(c)),'[]') from (
  select c.id,c.room_id,c.version,c.kind,c.entity_id,c.before_data,c.after_data,c.created_at,c.restored_from
  from jr_group_private.jr_public_changes c join jr_group_private.jr_rooms r on r.id=c.room_id
  where r.id=target and r.is_public order by c.version desc,c.created_at desc limit 100
 ) c);
end;$$;
create or replace function public.jr_group_create(request_id uuid,group_name text,access_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing jr_group_private.groups; hashed text;clean text:=trim(group_name);initial jsonb;
begin
 if request_id is null or clean is null or length(clean) not between 1 and 60 or access_token is null or access_token!~'^[0-9a-f]{64}$' then return jsonb_build_object('error','INVALID_GROUP');end if;
 hashed:=encode(sha256(convert_to(access_token,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,0));
 select * into existing from jr_group_private.groups where id=request_id;
 if existing.id is not null then
  if existing.token_hash<>hashed or existing.name<>clean then return jsonb_build_object('error','REQUEST_REUSED');end if;
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
revoke all on all tables in schema jr_group_private from public,anon,authenticated;
revoke all on all functions in schema jr_group_private from public,anon,authenticated;
revoke all on function public.jr_group_status(),public.jr_group_info(),public.jr_group_list(boolean),public.jr_group_room(uuid),public.jr_group_apply(uuid,uuid,uuid,jsonb),public.jr_group_tournament_create(uuid,uuid,jsonb),public.jr_group_index(int,int),public.jr_group_changes(uuid),public.jr_group_create(uuid,text,text) from public;
grant execute on function public.jr_group_status(),public.jr_group_info(),public.jr_group_list(boolean),public.jr_group_room(uuid),public.jr_group_apply(uuid,uuid,uuid,jsonb),public.jr_group_tournament_create(uuid,uuid,jsonb),public.jr_group_index(int,int),public.jr_group_changes(uuid),public.jr_group_create(uuid,text,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
