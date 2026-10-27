-- Quizzy live session storage. Run in the Supabase SQL editor before configuring .env.local.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  pin text unique not null check (pin ~ '^[0-9]{6}$'),
  host_id uuid not null,
  host_hash text not null,
  quiz jsonb not null,
  status text not null default 'lobby' check (status in ('lobby','question','reveal','finished')),
  question_index int not null default 0,
  deadline timestamptz,
  capacity int not null default 500 check (capacity between 200 and 5000),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists game_sessions_host_idx on public.game_sessions(host_id, completed_at desc);
create table if not exists public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.game_sessions(id) on delete cascade,
  credential_hash text not null,
  display_name text not null check (length(display_name) between 1 and 24),
  score int not null default 0,
  last_earned int not null default 0,
  joined_at timestamptz not null default now(),
  unique (game_id, id)
);
create unique index if not exists game_players_name_ci_idx on public.game_players(game_id, lower(display_name));
create index if not exists game_players_rank_idx on public.game_players(game_id, score desc, last_earned desc, joined_at);
create table if not exists public.game_answers (
  game_id uuid not null,
  player_id uuid not null,
  question_index int not null,
  option_index int not null check (option_index between 0 and 3),
  answered_at timestamptz not null default now(),
  primary key(game_id, player_id, question_index),
  foreign key(game_id, player_id) references public.game_players(game_id, id) on delete cascade
);
create index if not exists game_answers_question_idx on public.game_answers(game_id, question_index, option_index);
create table if not exists public.game_results (
  game_id uuid primary key references public.game_sessions(id) on delete cascade,
  quiz_title text not null,
  completed_at timestamptz not null default now(),
  player_count int not null,
  rankings jsonb not null
);

alter table public.game_sessions enable row level security;
alter table public.game_players enable row level security;
alter table public.game_answers enable row level security;
alter table public.game_results enable row level security;
revoke all on public.game_sessions, public.game_players, public.game_answers, public.game_results from anon, authenticated;

create or replace function public.quizzy_ping() returns trigger language plpgsql security definer set search_path = '' as $$
declare rid uuid;
begin
  rid := coalesce((to_jsonb(new)->>'game_id')::uuid,(to_jsonb(old)->>'game_id')::uuid,(to_jsonb(new)->>'id')::uuid,(to_jsonb(old)->>'id')::uuid);
  -- Payload is only an invalidation hint; public matches the anonymous client's channel config.
  perform realtime.send(jsonb_build_object('kind',tg_table_name),'room_refresh','quizzy:'||rid::text,false);
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;
drop trigger if exists quizzy_session_ping on public.game_sessions;
create trigger quizzy_session_ping after insert or update on public.game_sessions for each row execute function public.quizzy_ping();
drop trigger if exists quizzy_answer_ping on public.game_answers;

create or replace function public.quizzy_create_game(p_pin text,p_host_id uuid,p_credential text,p_quiz jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare gid uuid;
begin
  if p_pin !~ '^[0-9]{6}$' or length(p_credential)<32 or jsonb_typeof(p_quiz->'questions') is distinct from 'array' or coalesce(jsonb_array_length(p_quiz->'questions'),0) not between 1 and 30 or coalesce(length(btrim(p_quiz->>'title')),0)=0 or coalesce(p_quiz->>'scoring','') not in ('plain','speed') then raise exception 'INVALID_GAME'; end if;
  if exists(select 1 from jsonb_array_elements(p_quiz->'questions') as questions(q)
    where jsonb_typeof(q->'options') is distinct from 'array' or jsonb_array_length(q->'options')<>4
      or coalesce((q->>'correct')::int,-1) not between 0 and 3 or coalesce((q->>'seconds')::int,0) not between 5 and 120
      or coalesce(length(btrim(q->>'text')),0)=0
      or exists(select 1 from jsonb_array_elements_text(q->'options') as answers(answer) where length(btrim(answer))=0)) then raise exception 'INVALID_QUESTION'; end if;
  insert into public.game_sessions(pin,host_id,host_hash,quiz) values(p_pin,p_host_id,encode(extensions.digest(p_credential,'sha256'),'hex'),p_quiz) returning id into gid;
  return jsonb_build_object('game_id',gid,'pin',p_pin);
exception when unique_violation then raise exception 'PIN_COLLISION';
end; $$;

create or replace function public.quizzy_join_game(p_pin text,p_name text,p_credential text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.game_sessions%rowtype; pid uuid;
begin
  if length(p_credential)<32 then raise exception 'INVALID_CREDENTIAL'; end if;
  select * into g from public.game_sessions where pin=p_pin for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if g.status<>'lobby' then raise exception 'GAME_ALREADY_STARTED'; end if;
  if (select count(*) from public.game_players where game_id=g.id)>=g.capacity then raise exception 'ROOM_FULL'; end if;
  insert into public.game_players(game_id,credential_hash,display_name) values(g.id,encode(extensions.digest(p_credential,'sha256'),'hex'),btrim(p_name)) returning id into pid;
  return jsonb_build_object('game_id',g.id,'player_id',pid,'pin',g.pin,'name',btrim(p_name));
exception when unique_violation then raise exception 'NAME_TAKEN';
end; $$;

create or replace function public.quizzy_game_state(p_game_id uuid,p_credential text,p_is_host boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.game_sessions%rowtype; pid uuid; qdata jsonb; pdata jsonb; counts jsonb; mine int; result_data jsonb;
begin
  select * into g from public.game_sessions where id=p_game_id;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if p_is_host then
    if g.host_hash<>encode(extensions.digest(p_credential,'sha256'),'hex') then raise exception 'UNAUTHORIZED'; end if;
  else
    select id into pid from public.game_players where game_id=g.id and credential_hash=encode(extensions.digest(p_credential,'sha256'),'hex');
    if pid is null then raise exception 'UNAUTHORIZED'; end if;
  end if;
  if p_is_host then qdata:=g.quiz;
  elsif g.status='reveal' then
    select jsonb_set(g.quiz,'{questions}',coalesce(jsonb_agg(case when n-1=g.question_index then q else q-'correct' end order by n),'[]'::jsonb)) into qdata
    from jsonb_array_elements(g.quiz->'questions') with ordinality t(q,n);
  elsif g.status='finished' then qdata:=g.quiz;
  else select jsonb_set(g.quiz,'{questions}',coalesce(jsonb_agg(q-'correct' order by n),'[]'::jsonb)) into qdata from jsonb_array_elements(g.quiz->'questions') with ordinality t(q,n); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'score',p.score,'lastEarned',p.last_earned,'joinedAt',extract(epoch from p.joined_at)*1000,'color',p.seat,'rank',p.rank) order by p.rank),'[]'::jsonb)
  into pdata from (select gp.*,row_number() over(order by gp.joined_at)-1 as seat,row_number() over(order by gp.score desc,gp.last_earned desc,gp.joined_at) as rank from public.game_players gp where gp.game_id=g.id) p
  where (p_is_host and (g.status='lobby' or p.rank<=20)) or (not p_is_host and (p.rank<=10 or p.id=pid));
  select coalesce(jsonb_agg(jsonb_build_object('option',a.option_index,'count',a.n) order by a.option_index),'[]'::jsonb) into counts
  from (select option_index,count(*) n from public.game_answers where game_id=g.id and question_index=g.question_index group by option_index) a;
  if pid is not null then select option_index into mine from public.game_answers where game_id=g.id and player_id=pid and question_index=g.question_index; end if;
  select rankings into result_data from public.game_results where game_id=g.id;
  return jsonb_build_object('id',g.id,'pin',g.pin,'status',g.status,'current',g.question_index,'deadline',g.deadline,'created_at',g.created_at,'completed_at',g.completed_at,'quiz',qdata,'players',pdata,'player_count',(select count(*) from public.game_players where game_id=g.id),'own_player',(select jsonb_build_object('id',p.id,'name',p.display_name,'score',p.score,'lastEarned',p.last_earned,'joinedAt',extract(epoch from p.joined_at)*1000,'rank',(select count(*)+1 from public.game_players x where x.game_id=p.game_id and (x.score>p.score or (x.score=p.score and x.last_earned>p.last_earned) or (x.score=p.score and x.last_earned=p.last_earned and x.joined_at<p.joined_at)))) from public.game_players p where p.id=pid),'answer_counts',counts,'own_answer',mine,'results',result_data);
end; $$;

create or replace function public.quizzy_start_game(p_game_id uuid,p_credential text) returns void language plpgsql security definer set search_path = '' as $$
declare g public.game_sessions%rowtype;
begin
  select * into g from public.game_sessions where id=p_game_id for update;
  if g.host_hash<>encode(extensions.digest(p_credential,'sha256'),'hex') then raise exception 'UNAUTHORIZED'; end if;
  if g.status<>'lobby' or not exists(select 1 from public.game_players where game_id=g.id) then raise exception 'CANNOT_START'; end if;
  update public.game_sessions set status='question',question_index=0,deadline=now()+make_interval(secs=>(quiz->'questions'->0->>'seconds')::int) where id=g.id;
end; $$;

create or replace function public.quizzy_submit_answer(p_game_id uuid,p_player_id uuid,p_credential text,p_option int) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.game_sessions%rowtype;
begin
  select * into g from public.game_sessions where id=p_game_id for share;
  if not exists(select 1 from public.game_players where game_id=g.id and id=p_player_id and credential_hash=encode(extensions.digest(p_credential,'sha256'),'hex')) then raise exception 'UNAUTHORIZED'; end if;
  if g.status<>'question' or g.deadline<=now() then raise exception 'QUESTION_CLOSED'; end if;
  if p_option not between 0 and 3 then raise exception 'INVALID_ANSWER'; end if;
  insert into public.game_answers(game_id,player_id,question_index,option_index) values(g.id,p_player_id,g.question_index,p_option);
exception when unique_violation then raise exception 'ANSWER_ALREADY_SUBMITTED';
end; $$;

create or replace function public.quizzy_reveal(p_game_id uuid,p_credential text) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.game_sessions%rowtype; q jsonb;
begin
  select * into g from public.game_sessions where id=p_game_id for update;
  if g.host_hash<>encode(extensions.digest(p_credential,'sha256'),'hex') then raise exception 'UNAUTHORIZED'; end if;
  if g.status<>'question' then raise exception 'NOT_QUESTION_PHASE'; end if;
  q:=g.quiz->'questions'->g.question_index;
  update public.game_players p set last_earned=case when a.option_index=(q->>'correct')::int then case when g.quiz->>'scoring'='plain' then 1000 else 500+floor(500*greatest(0,extract(epoch from (g.deadline-a.answered_at))/(q->>'seconds')::numeric))::int end else 0 end,
  score=p.score+case when a.option_index=(q->>'correct')::int then case when g.quiz->>'scoring'='plain' then 1000 else 500+floor(500*greatest(0,extract(epoch from (g.deadline-a.answered_at))/(q->>'seconds')::numeric))::int end else 0 end
  from public.game_answers a where a.game_id=g.id and a.player_id=p.id and a.question_index=g.question_index;
  update public.game_players set last_earned=0 where game_id=g.id and id not in(select player_id from public.game_answers where game_id=g.id and question_index=g.question_index);
  update public.game_sessions set status='reveal' where id=g.id;
end; $$;

create or replace function public.quizzy_advance(p_game_id uuid,p_credential text) returns void language plpgsql security definer set search_path = '' as $$
declare g public.game_sessions%rowtype; total_q int;
begin
  select * into g from public.game_sessions where id=p_game_id for update;
  if g.host_hash<>encode(extensions.digest(p_credential,'sha256'),'hex') then raise exception 'UNAUTHORIZED'; end if;
  if g.status<>'reveal' then raise exception 'NOT_REVEAL_PHASE'; end if;
  total_q:=jsonb_array_length(g.quiz->'questions');
  if g.question_index+1>=total_q then
    update public.game_sessions set status='finished',completed_at=now() where id=g.id;
    insert into public.game_results(game_id,quiz_title,player_count,rankings)
      select g.id,g.quiz->>'title',count(*),coalesce(jsonb_agg(jsonb_build_object('id',id,'name',display_name,'score',score,'lastEarned',last_earned,'joinedAt',extract(epoch from joined_at)*1000) order by score desc,last_earned desc,joined_at),'[]'::jsonb)
      from public.game_players where game_id=g.id on conflict(game_id) do update set quiz_title=excluded.quiz_title,player_count=excluded.player_count,rankings=excluded.rankings,completed_at=now();
  else update public.game_sessions set status='question',question_index=g.question_index+1,deadline=now()+make_interval(secs=>(quiz->'questions'->(g.question_index+1)->>'seconds')::int) where id=g.id;
  end if;
end; $$;

create or replace function public.quizzy_host_results(p_game_id uuid,p_credential text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  select gr.rankings into r from public.game_results gr join public.game_sessions gs on gs.id=gr.game_id where gr.game_id=p_game_id and gs.host_hash=encode(extensions.digest(p_credential,'sha256'),'hex');
  if r is null then raise exception 'RESULTS_NOT_FOUND_OR_UNAUTHORIZED'; end if; return r;
end; $$;

create or replace function public.quizzy_list_results(p_host_id uuid,p_credential text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  if not exists(select 1 from public.game_sessions where host_id=p_host_id and host_hash=encode(extensions.digest(p_credential,'sha256'),'hex')) then raise exception 'UNAUTHORIZED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('game_id',gr.game_id,'quiz_title',gr.quiz_title,'completed_at',gr.completed_at,'player_count',gr.player_count,'rankings',gr.rankings) order by gr.completed_at desc),'[]'::jsonb)
  into r from public.game_results gr join public.game_sessions gs on gs.id=gr.game_id where gs.host_id=p_host_id and gs.host_hash=encode(extensions.digest(p_credential,'sha256'),'hex');
  return r;
end; $$;

revoke all on function public.quizzy_create_game(text,uuid,text,jsonb),public.quizzy_join_game(text,text,text),public.quizzy_game_state(uuid,text,boolean),public.quizzy_start_game(uuid,text),public.quizzy_submit_answer(uuid,uuid,text,int),public.quizzy_reveal(uuid,text),public.quizzy_advance(uuid,text),public.quizzy_host_results(uuid,text),public.quizzy_list_results(uuid,text) from public;
grant execute on function public.quizzy_create_game(text,uuid,text,jsonb),public.quizzy_join_game(text,text,text),public.quizzy_game_state(uuid,text,boolean),public.quizzy_start_game(uuid,text),public.quizzy_submit_answer(uuid,uuid,text,int),public.quizzy_reveal(uuid,text),public.quizzy_advance(uuid,text),public.quizzy_host_results(uuid,text),public.quizzy_list_results(uuid,text) to anon,authenticated;
