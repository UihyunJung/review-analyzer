-- 운영 모니터링: Gemini 에러 이벤트 적재 + Telegram 알림 dedup 판정
-- 적용: 2026-06-11 Supabase MCP migrations
--   (error_monitoring_alerts, revoke_cleanup_trigger_execute, alert_dedup_per_env)
-- 이 파일은 레포 보관용 사본 — DB 상태가 원본
--
-- 알림 정책:
--   critical → 첫 발생 즉시 알림
--   warning  → 10분 내 동일 분류+환경 3건 도달 시 알림
--   공통     → 동일 분류+환경 60분 내 재알림 스킵 (dedup, env별 분리 — dev 테스트가 prod 알림을 막지 않음)

create table public.error_events (
  id bigserial primary key,
  classification text not null,
  severity text not null,
  status int,
  error_code text,
  message text,
  env text,
  created_at timestamptz not null default now()
);
create index idx_error_events_class_created on public.error_events (classification, created_at desc);
create index idx_error_events_created on public.error_events (created_at);
alter table public.error_events enable row level security;

create table public.error_alert_state (
  classification text not null,
  env text not null,
  last_sent_at timestamptz,
  primary key (classification, env)
);
alter table public.error_alert_state enable row level security;

create or replace function public.record_error_and_check_alert(
  p_classification text,
  p_severity text,
  p_status int,
  p_error_code text,
  p_message text,
  p_env text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_env text := coalesce(p_env, 'unknown');
  v_last timestamptz;
  v_count int;
  v_should boolean := false;
begin
  insert into public.error_events (classification, severity, status, error_code, message, env)
  values (p_classification, p_severity, p_status, p_error_code, left(p_message, 1000), v_env);

  insert into public.error_alert_state (classification, env)
  values (p_classification, v_env)
  on conflict (classification, env) do nothing;

  -- 동시 호출 직렬화 (행 잠금) — 판정 전에 last_sent_at을 갱신하면 안 됨
  select last_sent_at into v_last
  from public.error_alert_state
  where classification = p_classification and env = v_env
  for update;

  if v_last is not null and now() - v_last < interval '60 minutes' then
    return false; -- 동일 분류+환경 60분 dedup
  end if;

  if p_severity = 'critical' then
    v_should := true; -- critical은 첫 발생 즉시
  else
    select count(*) into v_count
    from public.error_events
    where classification = p_classification
      and env = v_env
      and created_at > now() - interval '10 minutes';
    v_should := v_count >= 3; -- warning은 10분 내 3건 도달 시
  end if;

  if v_should then
    update public.error_alert_state
    set last_sent_at = now()
    where classification = p_classification and env = v_env;
  end if;

  return v_should;
end;
$$;

-- PostgREST 기본 PUBLIC EXECUTE 차단 — service_role만 RPC 호출 가능
revoke execute on function public.record_error_and_check_alert(text, text, int, text, text, text) from public, anon, authenticated;
grant execute on function public.record_error_and_check_alert(text, text, int, text, text, text) to service_role;

-- 30일 초과 이벤트 정리 (기존 cleanup_old_history 트리거 패턴)
create or replace function public.cleanup_old_error_events()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.error_events where created_at < now() - interval '30 days';
  return null;
end;
$$;

-- 트리거 함수도 PostgREST RPC 노출 차단 (트리거 발화에는 EXECUTE 권한 불필요)
revoke execute on function public.cleanup_old_error_events() from public, anon, authenticated;

create trigger trg_cleanup_error_events
  after insert on public.error_events
  for each statement
  execute function public.cleanup_old_error_events();
