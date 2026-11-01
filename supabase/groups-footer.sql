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
