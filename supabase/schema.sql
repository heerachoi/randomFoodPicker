create extension if not exists "pgcrypto";

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
    check (char_length(trim(name)) > 0 and char_length(name) <= 20),
  created_at timestamptz not null default now()
);

create table if not exists restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
    check (char_length(trim(name)) > 0 and char_length(name) <= 40),
  created_at timestamptz not null default now()
);

create table if not exists restaurant_categories (
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  primary key (restaurant_id, category_id)
);

-- 이용자별 오늘 제외: 예전 (day, category_id) 공통 테이블에서 마이그레이션
drop table if exists daily_exclusions;
drop table if exists daily_participants;

create table if not exists daily_participants (
  day date not null,
  participant_id uuid not null,
  nickname text not null
    check (char_length(trim(nickname)) > 0 and char_length(nickname) <= 40),
  updated_at timestamptz not null default now(),
  primary key (day, participant_id),
  unique (day, nickname)
);

create table if not exists daily_exclusions (
  day date not null,
  participant_id uuid not null,
  category_id uuid not null references categories(id) on delete cascade,
  primary key (day, participant_id, category_id),
  foreign key (day, participant_id) references daily_participants(day, participant_id) on delete cascade
);

create index if not exists restaurant_categories_category_id_idx
  on restaurant_categories (category_id);

create index if not exists daily_participants_day_idx
  on daily_participants (day);

alter table categories enable row level security;
alter table restaurants enable row level security;
alter table restaurant_categories enable row level security;
alter table daily_participants enable row level security;
alter table daily_exclusions enable row level security;

-- 팀 내부 공유 도구용: anon 키로 읽기/쓰기 허용
-- (공개 GitHub Pages에서 누구나 수정 가능. 나중에 Auth + RLS로 제한하세요.)
drop policy if exists "categories_all" on categories;
create policy "categories_all" on categories for all using (true) with check (true);

drop policy if exists "restaurants_all" on restaurants;
create policy "restaurants_all" on restaurants for all using (true) with check (true);

drop policy if exists "restaurant_categories_all" on restaurant_categories;
create policy "restaurant_categories_all" on restaurant_categories for all using (true) with check (true);

drop policy if exists "daily_participants_all" on daily_participants;
create policy "daily_participants_all" on daily_participants for all using (true) with check (true);

drop policy if exists "daily_exclusions_all" on daily_exclusions;
create policy "daily_exclusions_all" on daily_exclusions for all using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table categories;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table restaurants;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table restaurant_categories;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table daily_participants;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table daily_exclusions;
exception when duplicate_object then null;
end $$;

-- 기본 카테고리
insert into categories (name) values
  ('중식'), ('햄버거'), ('한식'), ('초밥'), ('순대국'),
  ('돈까츠'), ('라멘'), ('건강식'), ('샌드위치')
on conflict (name) do nothing;

-- 기본 음식점
with seed(name, cats) as (
  values
    ('쌀국수', array['중식']),
    ('베트남노상식당 연남본점', array['중식']),
    ('쎕이리', array['중식']),
    ('동보성', array['중식']),
    ('동파육1080', array['중식']),
    ('서담헌', array['중식']),
    ('왁버거', array['햄버거']),
    ('파파이스', array['햄버거']),
    ('맘스터치', array['햄버거']),
    ('치벅', array['햄버거']),
    ('코리아', array['한식']),
    ('옹시미', array['한식']),
    ('서교동 연탄집', array['한식']),
    ('삼평식당', array['한식']),
    ('한상', array['한식']),
    ('스시엔준', array['초밥']),
    ('올바른스시', array['초밥']),
    ('보승회관', array['순대국']),
    ('긴자료코', array['돈까츠']),
    ('명동왕돈까스', array['돈까츠']),
    ('카츠업', array['돈까츠']),
    ('면식당 홍익대점', array['라멘']),
    ('닌닌라멘', array['라멘']),
    ('라멘 무메이', array['라멘']),
    ('히루마', array['라멘']),
    ('미스터라멘 서교점', array['라멘']),
    ('멘노아지 홍대점', array['라멘']),
    ('프로티너', array['건강식']),
    ('프레퍼스', array['건강식']),
    ('서브웨이', array['샌드위치'])
),
inserted as (
  insert into restaurants (name)
  select name from seed
  on conflict (name) do nothing
  returning id, name
)
insert into restaurant_categories (restaurant_id, category_id)
select coalesce(i.id, r.id), c.id
from seed s
join categories c on c.name = any (s.cats)
left join inserted i on i.name = s.name
join restaurants r on r.name = s.name
on conflict do nothing;
