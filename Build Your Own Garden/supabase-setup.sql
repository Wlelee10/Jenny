-- BUILD YOUR OWN GARDEN — HUMAN GALLERY (Supabase)
-- Supabase 대시보드 → SQL Editor → New query 에 전부 붙여넣고 Run 한 번

-- 1. 저장된 정원 목록
create table if not exists public.gardens (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 60),
  fragments   int  not null check (fragments between 0 and 200),
  seconds     int  not null check (seconds between 0 and 10000000),
  image       text not null check (image ~ '^[A-Za-z0-9-]+\.jpg$'),
  created_at  timestamptz not null default now()
);

-- 누구나 보고 새로 추가할 수 있지만, 고치거나 지울 수는 없음
alter table public.gardens enable row level security;

drop policy if exists "gardens are public" on public.gardens;
create policy "gardens are public" on public.gardens
  for select to anon, authenticated using (true);

drop policy if exists "anyone can add a garden" on public.gardens;
create policy "anyone can add a garden" on public.gardens
  for insert to anon, authenticated with check (true);

-- 2. 정원 이미지 보관함 (공개, JPEG만, 한 장 최대 8MB)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gardens', 'gardens', true, 8388608, array['image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = 8388608, allowed_mime_types = array['image/jpeg'];

drop policy if exists "anyone can upload a garden image" on storage.objects;
create policy "anyone can upload a garden image" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'gardens');

-- 3. 좋아요 (휴먼 갤러리 하트)
-- 정원마다 좋아요 수
alter table public.gardens
  add column if not exists likes int not null default 0 check (likes >= 0);

-- 좋아요 +1 / -1 만 할 수 있는 함수
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
