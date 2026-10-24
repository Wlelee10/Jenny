-- BUILD YOUR OWN GARDEN — HUMAN GALLERY 좋아요 (Supabase)
-- Supabase 대시보드 → SQL Editor → New query 에 전부 붙여넣고 Run 한 번
-- (이미 저장된 정원은 그대로 남고, 좋아요 수 0에서 시작)

-- 1. 정원마다 좋아요 수
alter table public.gardens
  add column if not exists likes int not null default 0 check (likes >= 0);

-- 2. 좋아요 +1 / -1 만 할 수 있는 함수
--    (방문자는 표를 직접 고칠 수 없고, 이 함수로 좋아요 수만 한 칸씩 바꿀 수 있음)
create or replace function public.like_garden(garden_id uuid, delta int)
returns int
language sql
security definer
set search_path = public
as $$
  update public.gardens
     set likes = greatest(0, likes + case when delta > 0 then 1 else -1 end)
   where id = garden_id
  returning likes;
$$;

revoke all on function public.like_garden(uuid, int) from public;
grant execute on function public.like_garden(uuid, int) to anon, authenticated;
