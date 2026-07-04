-- ============================================================
-- Alignment OS 資料庫 Schema（階段 2/3/4）
-- 接續 supabase/schema.sql（階段 1）執行。
--
-- 欄位來源原則：
--   [已查證:原型] = 該欄位在 6 頁原型畫面上實際出現
--                   (preview.html page-data 解析)
--   [推測]        = 表間關聯、排序值、實作必需但原型未顯示的欄位
--   [需定義]      = 原型未給明確算法，留待你日後定義
-- ============================================================

-- ---------- 共用維度：四大槓桿分類（固定，不可自訂）----------
-- [已查證:原型 align/record/weekly 頁出現「策略突破/常態維運/系統優化/探索」]
-- 你的決定：「探索」改為「新知探索」，四類固定。
-- 用 do block 包起來，讓這份 SQL 可重複執行不報錯
-- （CREATE TYPE 不支援 IF NOT EXISTS）
do $$
begin
  if not exists (select 1 from pg_type where typname = 'leverage_type') then
    create type leverage_type as enum (
      'strategic',    -- 策略突破
      'operational',  -- 常態維運
      'systematic',   -- 系統優化
      'exploration'   -- 新知探索（原型為「探索」，依你決定改名）
    );
  end if;
end $$;

-- ---------- 表 3：projects（專案）----------
-- 為何先建 projects：tasks / key_results 都要參照它。
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,                       -- [已查證:原型「定價頁改版」]
  status text default 'active',             -- [已查證:原型「進行中/尚未啟動」] active/pending/done
  owner text,                               -- [已查證:原型「James」]
  due_date date,                            -- [已查證:原型「6/25」]
  is_core boolean default false,            -- [已查證:原型「核心專案」]
  -- 預計完成日:你的決定=先不做自動預測，留手動填。
  -- [已查證:原型「依近期速度推估」未給算法；自動預測缺陷大(估時不準、
  --  假設未來=過去)，故不自動算，由你手動填]
  est_complete_date date,                   -- 手動填，不自動推算
  created_at timestamptz default now(),
  sort_order int default 0                  -- [推測:原型未顯示，排序用]
);

-- ---------- 表 3b：project_phases（專案階段）----------
-- [已查證:原型 project 頁有「Phase 2 開發/Phase 3 測試上線」分階段結構]
-- 補欄位確認時的疏漏:原型專案頁是分 Phase 推進的。
create table if not exists project_phases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  name text not null,                       -- [已查證:原型「開發階段/測試上線」]
  seq int default 0,                        -- [已查證:原型「Phase 2/Phase 3」序號]
  is_current boolean default false,         -- [已查證:原型「Current Stage」]
  created_at timestamptz default now()
);

-- ---------- 表 1：okrs（Objective）----------
create table if not exists okrs (
  id uuid primary key default gen_random_uuid(),
  objective text not null,                  -- [已查證:原型「提升產品黏著與留存」]
  quarter text not null,                    -- [已查證:原型「2026 Q2」]
  created_at timestamptz default now(),
  sort_order int default 0                  -- [推測:排序用]
  -- 注意:objective 進度% 不存欄位。
  -- [已查證:原型標示「51% · KR 平均」=自動彙整]
  -- 由 key_results 進度平均即時算出（見底部 view）。
);

-- ---------- 表 2：key_results（KR，屬於某 Objective）----------
create table if not exists key_results (
  id uuid primary key default gen_random_uuid(),
  okr_id uuid references okrs(id) on delete cascade,  -- [推測:KR 屬於 Objective]
  title text not null,                      -- [已查證:原型「續訂率 80% → 85%」]
  -- KR 進度 = 所連多個專案完成度的「平均」[你的決定]。
  -- 不存死值，由 view 即時算（見底部 okr_progress / kr_progress）。
  sort_order int default 0
);

-- ---------- 表 2b：key_result_projects（KR↔專案 多對多）----------
-- [你的決定:一個 KR 會連多個專案，故用中間表]
create table if not exists key_result_projects (
  kr_id uuid references key_results(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  primary key (kr_id, project_id)
);

-- ---------- 表 4：tasks（工作項，屬於某專案）----------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,  -- [推測:工作項屬專案]
  phase_id uuid references project_phases(id) on delete set null,  -- [已查證:原型「所屬階段」下拉]
  name text not null,                       -- [已查證:原型「完成定價頁線框」]
  leverage leverage_type,                   -- [已查證:四大分類]
  priority text,                            -- [已查證:原型「P1/P2/P3」]
  planned_hours numeric,                    -- [已查證:原型「計劃 6h」]
  actual_hours numeric default 0,           -- [已查證:原型「5.5h」]
  status text default 'planned',            -- [已查證:原型「On-plan/Interrupt/Displaced/完成」]
  scheduled_date date,                      -- [已查證:原型有日期排程]
  -- 待排/已排:你的決定=Inbox 是 task 的狀態,非新表。
  -- false=待排(Inbox,想到先丟);true=已排(進了時間軸時段)。
  -- [已查證:原型「待排 Inbox · 想到先丟,有空拖進時段」]
  is_scheduled boolean default false,
  time_start time,                          -- [已查證:原型「09:00」]
  time_end time,                            -- [已查證:原型「11:00」]
  -- 時間歸屬:主責 / 部門支援
  ownership text default 'core',            -- [已查證:原型「My Core/Dept.」] core/dept
  is_done boolean default false,            -- [已查證:原型有完成勾選]
  -- 來自哪個循環項目(自動生成的週會等);手動 task 為 null。
  -- 配合 period_key 判斷「這週期是否已生成過」,避免重複。
  -- [你的決定:循環項目實體化為真 task]
  -- 註:外鍵約束移到檔案末端用 ALTER TABLE 補,避免建表順序問題
  --    (recurring_items 定義在 tasks 之後)。
  source_recurring_id uuid,
  source_period_key text,                   -- 該 task 對應的週期鍵
  -- 樂觀鎖版本號:防多裝置同時拖曳時默默覆蓋。
  -- 更新帶 WHERE version=舊值,成功則 +1;影響 0 筆=有人先改了。
  -- [已查證:OCC 標準做法,dev.to 2025/hrekov.com 2026]
  version int default 0,
  created_at timestamptz default now(),
  sort_order int default 0
);

-- ---------- 表 4b：recurring_items（固定排程 / 循環項目）----------
-- [你的決定:要做循環項目;已查證原型「週會、週報、月報等循環項目·每週」]
create table if not exists recurring_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,                       -- [已查證:原型「週會/週報/月報」]
  -- 頻率:weekly(每週)/biweekly(雙週)/monthly_date(每月第N號)/
  --      monthly_weekday(每月第K個週幾)
  -- [你的決定:完整,含月複/雙週;monthly 分兩種定義避免歧義]
  frequency text not null default 'weekly',
  weekday int,                              -- 0=日..6=六;weekly/biweekly/monthly_weekday 用
  -- 雙週基準:從這天所在週起算,每隔一週。[推測:雙週需基準週才能算]
  anchor_date date,                         -- biweekly 用
  -- 月複(第N號):day_of_month;月複(第K個週幾):week_of_month + weekday
  day_of_month int,                         -- monthly_date 用(1..31)
  week_of_month int,                        -- monthly_weekday 用(1..5,5=最後一個)
  time_start time,                          -- 固定時段起
  time_end time,                            -- 固定時段訖
  leverage leverage_type,                   -- 沿用四大分類(可選)
  created_at timestamptz default now()
);

-- 逐週略過記錄:某循環項在某週被單次刪除,不影響後續週。
-- [你的決定:單次刪除不影響後續週]
create table if not exists recurring_skips (
  recurring_id uuid references recurring_items(id) on delete cascade,
  period_key text not null,                 -- 該次的週期鍵(如 '2026-W23' 或 '2026-06')
  created_at timestamptz default now(),
  primary key (recurring_id, period_key)
);

-- 補上 tasks → recurring_items 的外鍵（此時兩表都已建立）。
-- 可重複執行:先檢查約束是否已存在。
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_source_recurring_fk'
  ) then
    alter table tasks
      add constraint tasks_source_recurring_fk
      foreign key (source_recurring_id)
      references recurring_items(id) on delete set null;
  end if;
end $$;

-- ---------- 表 5：project_blockers（卡點）----------
create table if not exists project_blockers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  task_name text,                           -- [已查證:原型「API 串接」]
  severity text,                            -- [已查證:原型「嚴重/注意」]
  reason text,                              -- [已查證:原型「等第三方 API 文件」]
  countermeasure text,                      -- [已查證:原型「先做其他項…」]
  manager_note text,                        -- [已查證:原型「定價頁優先度最高…」]
  created_at timestamptz default now()
);

-- ---------- 表 6：kpis（常態維運指標，Dashboard）----------
create table if not exists kpis (
  id uuid primary key default gen_random_uuid(),
  name text not null,                       -- [已查證:原型「續訂率」]
  current_value numeric,                    -- [已查證:原型「82%」]
  target_value numeric,                     -- [已查證:原型「85%」目標]
  -- 紅線值:跌破=真危機(原型「紅線=跌破就是真危機,會自動進風險預警」)
  -- [已查證:page_dash.html KPI 表單]
  redline_value numeric,
  -- 目標方向:higher=越高越好/lower=越低越好
  -- [已查證:原型「目標方向 越高/越低越好」]
  direction text default 'higher',
  unit text,                                -- [已查證:原型「單位」]
  review_frequency text default 'weekly',   -- [已查證:原型「每週/每兩週/每月/每季」]
  -- 來源:new=新訂維運指標/from_kr=從 KR 畢業
  -- [已查證:原型「新訂的維運指標/從 KR 畢業」]
  source text default 'new',
  trend text,                               -- [已查證:原型「好轉/2%」]
  updated_at timestamptz default now(),
  sort_order int default 0
);

-- ---------- 表 8：risks（風險預警，Dashboard）----------
create table if not exists risks (
  id uuid primary key default gen_random_uuid(),
  description text not null,                 -- [已查證:原型「行銷自動化專案未啟動」]
  source text default 'manual',             -- [已查證:原型「自動/手動」] auto/manual
  related_project_id uuid references projects(id) on delete set null,  -- [推測]
  created_at timestamptz default now()
);

-- ---------- 表 7：weekly_reports（週報）----------
-- 設計:平時即時、發布時凍結快照（依你的決定）。
-- 設定類欄位 = 即時用；快照類欄位 = 發布時填入。
create table if not exists weekly_reports (
  id uuid primary key default gen_random_uuid(),
  -- 設定類（即時）:
  week_start date not null,                 -- [已查證:原型「6/1–6/7」起]
  week_end date not null,                   -- [已查證:原型「6/1–6/7」訖]
  -- 你的決定:後台可設「週幾到週幾」+ 篩選器(上週/本週/下週)。
  -- 篩選器屬前端互動，不需存 DB；起訖日存這兩欄即可。
  -- 快照類（發布時凍結）:
  is_published boolean default false,       -- [已查證:原型「已發布」]
  published_at timestamptz,                 -- 發布時間（凍結時點）
  share_token text,                         -- [已查證:原型「唯讀分享連結生效中」]
  -- 草稿期手寫敘述（即時存,隨時續寫）:需主管的事、產出價值、耗損診斷。
  -- [你的決定:草稿也存]。發布時連同彙整數字一起凍結進 snapshot。
  draft jsonb default '{}',
  -- 凍結內容:發布當下把即時算出的數字複製存這裡。
  -- 用 jsonb 存整份快照(總時數、核心比例、戰果、需主管的事…)。
  -- [推測:快照存 JSON 是為了定格，不隨來源資料變動]
  snapshot jsonb,
  -- 「需要主管的事」三類:待裁示/提案/知會
  -- [已查證:原型 weekly 頁三類]。平時即時可另存獨立表，
  -- 但因與週報強綁、且發布要凍結，這裡併入 snapshot。
  created_at timestamptz default now()
);

-- ============================================================
-- RLS:全部啟用，只開放 authenticated（你登入後）。
-- 主管唯讀走 read-share Edge Function（service_role 後端讀），
-- 不對 anon 開任何 policy。
-- [已查證:設計依據 supabase RLS best practices,
--  supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices]
-- ============================================================
alter table projects         enable row level security;
alter table project_phases   enable row level security;
alter table okrs             enable row level security;
alter table key_results      enable row level security;
alter table tasks            enable row level security;
alter table recurring_items  enable row level security;
alter table recurring_skips  enable row level security;
alter table project_blockers enable row level security;
alter table kpis             enable row level security;
alter table risks            enable row level security;
alter table weekly_reports   enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'projects','project_phases','okrs','key_results','tasks',
    'recurring_items','recurring_skips','project_blockers','kpis','risks','weekly_reports'
  ]
  loop
    execute format(
      'drop policy if exists %I on %I; '
      'create policy %I on %I for all to authenticated using (true) with check (true);',
      t||'_auth_all', t, t||'_auth_all', t
    );
  end loop;
end $$;

-- ============================================================
-- 自動彙整 view（你的決定:自動算，不存死值）
-- 標 [推測] 者為原型未給明確公式、我採最直觀算法佔位。
-- ============================================================

-- Phase 完成度 = 該 Phase 下 task 完成數 / 總數
-- [已查證:原型「本階段 2/4 · 投入 4h」]
create or replace view phase_progress as
select
  ph.id as phase_id,
  ph.project_id,
  ph.name,
  ph.seq,
  count(t.*) filter (where t.is_done) as done_tasks,
  count(t.*) as total_tasks,
  coalesce(sum(t.actual_hours), 0) as logged_hours
from project_phases ph
left join tasks t on t.phase_id = ph.id
group by ph.id, ph.project_id, ph.name, ph.seq;

-- 專案完成度 = 已完成工作項數 / 總工作項數
-- [推測:原型顯示「40% · 2/5 項」，2/5=40%，據此反推公式，但原型未明文]
create or replace view project_progress as
select
  p.id as project_id,
  p.name,
  count(t.*) filter (where t.is_done) as done_tasks,
  count(t.*) as total_tasks,
  case when count(t.*) = 0 then 0
       else round(count(t.*) filter (where t.is_done)::numeric
                  / count(t.*) * 100) end as progress_pct,
  coalesce(sum(t.actual_hours), 0) as logged_hours  -- [已查證:原型「Logged 9.5h」]
from projects p
left join tasks t on t.project_id = p.id
group by p.id, p.name;

-- 時間流向 = tasks 實際時數按四大分類加總
-- [已查證:原型 align 頁「依槓桿性質 · 共312h」]
create or replace view time_flow as
select
  leverage,
  sum(actual_hours) as total_hours
from tasks
where leverage is not null
group by leverage;

-- KR 進度 = 其所連多個專案完成度的平均 [你的決定]
create or replace view kr_progress as
select
  kr.id as kr_id,
  kr.okr_id,
  kr.title,
  round(avg(coalesce(pp.progress_pct, 0))) as progress_pct
from key_results kr
left join key_result_projects krp on krp.kr_id = kr.id
left join project_progress pp on pp.project_id = krp.project_id
group by kr.id, kr.okr_id, kr.title;

-- Objective 進度 = 其下 KR 進度的平均
-- [已查證:原型「51% · KR 平均」]
create or replace view okr_progress as
select
  o.id as okr_id,
  o.objective,
  o.quarter,
  round(avg(coalesce(kp.progress_pct, 0))) as progress_pct
from okrs o
left join kr_progress kp on kp.okr_id = o.id
group by o.id, o.objective, o.quarter;

-- ============================================================
-- Realtime 設定（拖曳時間軸即時同步用）
-- 你的決定:Realtime + 樂觀鎖兩層防衝突。
-- [已查證:新專案預設關閉變更監聽,需手動加入 publication,
--  supabase.com/docs/guides/realtime/postgres-changes]
-- ============================================================

-- 1) REPLICA IDENTITY FULL:讓 UPDATE 事件帶舊值（前端可比對）
-- [已查證:supabase.com/docs/reference/swift/subscribe]
alter table tasks replica identity full;

-- 2) 把 tasks 加入 supabase_realtime publication
-- [已查證:supabase.com/docs/guides/realtime/postgres-changes]
-- 若 publication 不存在會報錯;Supabase 專案預設已建好此 publication。
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- 已加入則略過(避免重複報錯)
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'tasks'
    ) then
      alter publication supabase_realtime add table tasks;
    end if;
  end if;
end $$;
