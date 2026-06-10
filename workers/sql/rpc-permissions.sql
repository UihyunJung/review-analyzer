-- 기존 RPC의 PostgREST 노출 차단 — 호출자는 Worker(service_role)뿐
-- 적용: 2026-06-11 Supabase MCP migration (harden_existing_rpc_permissions)
-- 이 파일은 레포 보관용 사본 — DB 상태가 원본
--
-- 배경: Supabase는 public 스키마 함수를 /rest/v1/rpc/로 자동 노출하고
-- 기본값이 PUBLIC EXECUTE라, anon key 유출 시 사용량 카운트 조작이 가능했음
-- (advisor: anon_security_definer_function_executable)

revoke execute on function public.increment_usage(uuid, text, date, integer) from public, anon, authenticated;
grant execute on function public.increment_usage(uuid, text, date, integer) to service_role;

revoke execute on function public.decrement_usage(uuid, text, date) from public, anon, authenticated;
grant execute on function public.decrement_usage(uuid, text, date) to service_role;

revoke execute on function public.migrate_usage(text, text) from public, anon, authenticated;
grant execute on function public.migrate_usage(text, text) to service_role;

-- 트리거 전용 함수는 RPC 호출 불필요 — 전부 차단 (트리거 발화에는 EXECUTE 권한 불필요)
revoke execute on function public.cleanup_old_history() from public, anon, authenticated;

-- search_path 미지정 경고 해소 (advisor: function_search_path_mutable)
alter function public.migrate_usage(text, text) set search_path = public, pg_temp;
alter function public.cleanup_old_history() set search_path = public, pg_temp;

-- 신규 함수 생성 시 규칙: security definer면 반드시
--   set search_path = public, pg_temp
--   revoke execute ... from public, anon, authenticated + grant to service_role
