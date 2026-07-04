-- ============================================================
-- Alignment OS 資料庫 Schema（階段 1 + 分享機制）
-- 在 Supabase SQL Editor 貼上整段執行一次即可。
--
-- 設計依據：上線規劃書 v2
-- RLS 角色行為 [已查證:supabase.com/docs/guides/database/postgres/roles
--   及 .../row-level-security]
-- ============================================================

-- ---------- 階段 1：反思能力樹 ----------

-- 技能（5 條能力樹）
create table if not exists skills (
  id text primary key,              -- 'peer','strategy','focus','mood','comm'
  name text not null,
  short_motto text,                 -- 名稱下精簡心法（可編輯）
  full_motto text,                  -- 完整心法
  xp int default 0,                 -- 累積點數
  insights jsonb default '[]',      -- 領悟（最多 3 條）
  updated_at timestamptz default now()
);

-- 待問清單 + 已完成
create table if not exists quick_notes (
  id uuid primary key default gen_random_uuid(),
  skill_id text references skills(id),
  content text not null,
  status text default 'todo',       -- 'todo' / 'done'
  created_at timestamptz default now(),
  done_at timestamptz               -- 完成時間（保留 2 週判斷用）
);

-- 防閒置 ping 表
create table if not exists keep_alive (
  id bigint generated always as identity primary key,
  pinged_at timestamptz default now()
);

-- 反思頁 PIN（只存雜湊，不存明碼）
create table if not exists reflect_auth (
  id int primary key default 1,
  pin_hash text not null
);

-- ---------- 分享機制（階段 3 用）----------
-- 唯讀分享連結。原 v1 schema 缺此表，v2 補上。
create table if not exists share_links (
  token text primary key,           -- 不可猜的隨機字串
  scope text not null,              -- 'weekly'/'okr'/'align'... 控制可看哪些頁
  created_at timestamptz default now(),
  expires_at timestamptz            -- 預留過期時間，現階段可為 null（永久）
);

-- ============================================================
-- RLS 設定
--
-- 設計原則（v2 安全修正）：
-- 1. 全部表啟用 RLS。
-- 2. 只開放 authenticated（你登入後）讀寫。
-- 3. 明確用 TO authenticated 把 anon（未登入）排除，
--    不靠 auth.uid() 隱式排除——後者是常見外洩來源。
--    [已查證:supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices]
-- 4. 主管的唯讀分享「不走 anon 直連」，而是後端 Edge Function
--    用 secret key 繞過 RLS 讀取（見 functions/read-share）。
--    因此這些表「完全不對 anon 開任何 policy」。
-- ============================================================

alter table skills        enable row level security;
alter table quick_notes   enable row level security;
alter table keep_alive    enable row level security;
alter table reflect_auth  enable row level security;
alter table share_links   enable row level security;

-- skills：只有登入者可讀寫
drop policy if exists "skills_auth_all" on skills;
create policy "skills_auth_all" on skills
  for all to authenticated using (true) with check (true);

-- quick_notes：只有登入者可讀寫
drop policy if exists "qn_auth_all" on quick_notes;
create policy "qn_auth_all" on quick_notes
  for all to authenticated using (true) with check (true);

-- reflect_auth：前端完全不該直接讀（PIN 雜湊）。
-- 不建任何 policy → 連 authenticated 透過 Data API 也讀不到；
-- 只有後端 Edge Function（secret key，繞過 RLS）能讀。
-- keep_alive 同理：只給後端 ping 寫入。
-- share_links 同理：只給後端 read-share 函式查。
-- 以上三表「刻意不建 policy」，即對所有經由 Data API 的角色關閉。

-- keep_alive 的寫入由 GitHub Actions 帶 key 呼叫 REST；
-- 若你的 ping 用 anon key 寫入，需要下面這條最小 INSERT policy。
-- 若 ping 改用 secret key（建議），則不需要，保持關閉更安全。
-- 預設註解掉，依你 ping 用哪種 key 決定是否啟用：
-- drop policy if exists "ka_anon_insert" on keep_alive;
-- create policy "ka_anon_insert" on keep_alive
--   for insert to anon with check (true);

-- ============================================================
-- 保留策略（v2 釐清：查詢層過濾，不真刪除）
-- 「已完成保留 2 週、技能軌跡保留最新 5 筆」由查詢時過濾達成，
-- 資料不刪。範例查詢（應用層使用）：
--   已完成 2 週內：
--     select * from quick_notes
--     where status='done' and done_at > now() - interval '14 days';
-- ============================================================

-- ---------- 種子資料：5 條能力樹（可依需要修改）----------
insert into skills (id, name) values
  ('peer',     '協作'),
  ('strategy', '策略'),
  ('focus',    '專注'),
  ('mood',     '心境'),
  ('comm',     '溝通')
on conflict (id) do nothing;

-- ============================================================
-- 原子遞增 XP（修 bumpXp 讀後寫競態）
-- [debug loop 發現:原本前端「讀 xp 再寫 xp+delta」有競態,
--  快速連續操作會少算。改用資料庫端原子遞增。]
-- ============================================================
create or replace function increment_skill_xp(p_skill_id text, p_delta int)
returns void language sql as $$
  update skills set xp = xp + p_delta, updated_at = now()
  where id = p_skill_id;
$$;
