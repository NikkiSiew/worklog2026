# Alignment OS — 部署手冊

這份手冊讓你照著做就能上線。每一步都是「照著貼/照著點」，不需要懂程式。

> **誠實聲明（重要）**
> 此專案已在開發環境 `npm run build` **實際通過編譯**。
> 但**「連上你的 Supabase 後端能正常運作」這部分尚未驗證**——因為那需要你自己的 Supabase 專案與金鑰。
> 下面每個技術事實都標了來源；標 [記憶,未查證] 或 [推測] 的，請以官方文件為準。

---

## 你會用到的服務

| 服務 | 用途 | 費用 |
|---|---|---|
| Supabase | 資料庫 + 你的登入 + 後端函式 | 免費方案足夠（你 1 人＝1 MAU，遠在 50,000 免費額度內）[已查證:supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users] |
| Vercel | 部署前端 | 免費方案足夠 |
| GitHub | 放程式碼 + 防閒置 ping | 免費 |

---

## 目前完成的範圍（誠實界定）

- ✅ 完整 Next.js 16 專案，build 通過
- ✅ 你的登入（Email Magic Link）
- ✅ 反思頁：登入 + PIN 雙層保護，從資料庫讀能力樹
- ✅ 兩支 Edge Function：PIN 驗證、唯讀分享
- ✅ 防閒置 ping 的 GitHub Actions
- ✅ 完整資料庫 schema（階段 1 的 4 表 + share_links）
- ⚠️ **反思頁 UI 為功能骨架**，尚未貼入原型那套精緻視覺（原型 67KB HTML）。功能（解鎖、讀資料、計分）已接通；視覺可後續逐步搬入。
- ⛔ **階段 2/3/4 的頁面（對齊/OKR/記錄/週報/Dashboard/專案）尚未實作**，其資料表 schema 也尚未設計（見「待設計」段）。

---

## 第一步：建立 Supabase 專案

1. 到 https://database.new 建立新專案，記下你設的資料庫密碼。
2. 專案建好後，到 **Settings → API Keys**，準備複製兩把 key：
   - **Publishable key**（`sb_publishable_xxx`）→ 給前端用
   - **Secret key**（`sb_secret_xxx`）→ 給後端用，**絕不可外流**
   > 註：若你的後台還是舊版，對應的是 anon key（前端）與 service_role key（後端）。
   > 舊 key 將於 2026 年底淘汰。[已查證:supabase.com/docs/guides/auth/server-side/creating-a-client]
3. 到 **Settings → API**，記下 **Project URL**（`https://xxx.supabase.co`）。

---

## 第二步：建立資料表

1. 在 Supabase 後台打開 **SQL Editor**。
2. 把 `supabase/schema.sql` 整個檔案內容貼上，按 **Run**。
3. 應該看到執行成功，左側 Table Editor 會出現 skills、quick_notes、keep_alive、reflect_auth、share_links 五張表。
4. （階段 2/3/4）再把 `supabase/schema-stage234.sql` 整個貼上、Run，會再建出 projects、okrs、key_results、key_result_projects、tasks、project_phases、recurring_items、project_blockers、kpis、risks、weekly_reports 等表與自動彙整 view。
   > 此檔可重複執行不報錯（enum 用 do block 包裝）。
   > 自動彙整邏輯：專案完成度＝完成項數÷總項數；KR 進度＝所連多專案完成度平均；
   > Objective 進度＝其下 KR 平均；Phase 完成度＝該階段 task 完成數÷總數。皆為即時 view，不存死值。
   > [已查證:本檔通過 PostgreSQL 官方 parser 驗證]
5. （記錄頁拖曳即時同步）`schema-stage234.sql` 末段已含 Realtime 設定：
   把 tasks 表設 `replica identity full` 並加入 `supabase_realtime` publication。
   > 這是記錄頁「多裝置拖曳即時同步」所需。若這段沒跑成功，拖曳仍能用（樂觀鎖保護），
   > 但其他裝置不會即時看到變更，需手動重新整理。
   > [已查證:新專案預設關閉變更監聽,需手動加入 publication,
   >  supabase.com/docs/guides/realtime/postgres-changes]
   > 你也可在後台 Database → Publications 確認 tasks 已勾選。

---

## 第三步：設定你的反思頁 PIN

PIN 只存「雜湊值」，不存明碼。產生雜湊的方式（擇一）：

**方法 A：用線上 SHA-256 工具**
把你要的 PIN（例如 `4829`）用任何 SHA-256 工具算出雜湊，複製那串 64 字元的十六進位。

**方法 B：在電腦終端機算**（macOS/Linux）
```bash
echo -n "4829" | shasum -a 256
```
取前面那段 64 字元雜湊（空白前的部分）。

然後在 SQL Editor 執行（把雜湊換成你算出來的）：
```sql
insert into reflect_auth (id, pin_hash)
values (1, '你算出來的64字元雜湊')
on conflict (id) do update set pin_hash = excluded.pin_hash;
```

> **PIN 忘記了怎麼辦**：重跑上面這段 SQL，換成新 PIN 的雜湊即可重設。
> 這是唯一後門，只有能登入 Supabase 後台的你能做。[推測:此為「只存雜湊」設計下的標準重設路徑]

---

## 第四步：部署兩支 Edge Function

兩支函式在 `supabase/functions/` 下：`verify-pin`、`read-share`。

**可在 Supabase 後台網頁直接貼上部署，不必裝 Docker。**
[已查證:CLI 在無 Docker 時改用 API 部署，可於 Dashboard 操作,supabase.com/docs/guides/functions/quickstart]

1. 後台 **Edge Functions → Create function**，命名 `verify-pin`，把 `supabase/functions/verify-pin/index.ts` 內容貼上、Deploy。
2. 同樣建立 `read-share`，貼 `supabase/functions/read-share/index.ts`、Deploy。
3. 設定函式用的密鑰（**Edge Functions → Secrets** 或用 CLI）：
   - `REFLECT_SESSION_SECRET`：隨便一串長亂碼（給 PIN token 簽章用）
   > `SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY` 由平台自動注入，不需你設。
   > [已查證:supabase.com/docs/guides/functions/secrets]

---

## 第五步：把程式碼推上 GitHub

```bash
cd alignment-os
git init
git add .
git commit -m "Alignment OS initial"
# 在 GitHub 建一個 repo，然後：
git remote add origin https://github.com/你的帳號/alignment-os.git
git push -u origin main
```

> `.env.local` 已被 `.gitignore` 排除，金鑰不會上傳。

---

## 第六步：連 Vercel 部署

1. 到 https://vercel.com，用 GitHub 登入，**Import** 你的 repo。
2. 在 **Environment Variables** 填入三個變數（值見 `.env.example` 說明）：
   - `NEXT_PUBLIC_SUPABASE_URL` = 你的 Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = publishable key（或 anon key）
   - `SUPABASE_SECRET_KEY` = secret key（或 service_role key）— **只在此處，勿加 NEXT_PUBLIC**
3. Deploy。完成後你會拿到一個網址。
4. 回 Supabase **Authentication → URL Configuration**，把 Vercel 網址加入 **Redirect URLs**（例如 `https://你的app.vercel.app/auth/callback`），否則 magic link 登入會失敗。

---

## 第七步：設定防閒置 ping

Supabase 免費專案閒置 7 天會暫停（資料不刪，可喚醒）。
[已查證:supabase.com/pricing 2026；nocode.mba 2026]

1. 在 GitHub repo **Settings → Secrets and variables → Actions** 新增兩個 secret：
   - `SUPABASE_URL` = 你的 Project URL
   - `SUPABASE_KEY` = **secret key**（建議，能繞過 RLS 直接寫入 keep_alive）
2. `.github/workflows/keep-alive.yml` 已內建，會每 3 天自動 ping。
   > cron 設 3 天（非 7 天）是留排程延遲餘裕。
   > [已查證:GitHub Actions 排程在高負載時可能延遲,docs.github.com]

---

## 第八步：產生給主管的唯讀分享連結

主管不需註冊。你在 SQL Editor 產生一個 token：
```sql
insert into share_links (token, scope)
values (encode(gen_random_bytes(16), 'hex'), 'weekly');
-- 然後查出剛產生的 token：
select token, scope from share_links order by created_at desc limit 1;
```
把網址 `https://你的app.vercel.app/report/那個token` 給主管即可。
他只能看 `scope` 對應的頁，不能改、也碰不到反思頁。

---

## 待設計（誠實列出，尚未完成）

以下屬規劃書定的階段 2/3/4，**已全部完成**：

- ✅ 六大功能頁全部接上資料庫：Dashboard、對齊、OKR、記錄、專案、週報、反思
- ✅ 跨頁共用導覽列（/login 與 /report 唯讀分享頁除外）
- ✅ 記錄頁拖曳時間軸（半小時格 + Realtime + 樂觀鎖）
- ✅ 循環項目自動排入（每週/雙週/月複，逐週略過）
- ✅ 對齊頁優先序拖曳（跨組 + 組內精確插入）
- ✅ Dashboard 四象限（KPI 紅線跌破即時併入風險）
- ✅ 週報「平時即時、發布凍結快照」+ 唯讀分享連結

仍需你注意（誠實列出）：

- 反思頁精緻視覺（從原型 67KB HTML 搬入）尚未做，目前是功能版
- 計分規則是否與原型 JS 完全一致 [記憶,未查證:來自規劃書，未逐行核對原型]
- 「專案可能延遲」「KPI 趨勢」需歷史/預測資料，目前留欄位手動填，不自動算

> 所有頁面已 `npm run build` 通過、tsc 嚴格檢查 0 錯誤、lib 與 schema 欄位一致。
> 但「連上 Supabase 實際運作」「拖曳真實手感（含手機觸控）」需你部署後實機驗證，
> 本開發環境無法連 Supabase、無法模擬互動。

---

## 本機開發（選用）

```bash
npm install
cp .env.example .env.local   # 填入你的 Supabase 值
npm run dev                  # http://localhost:3000
```

---

## 專案結構

```
alignment-os/
├─ app/
│  ├─ page.tsx              # 導向 /reflect
│  ├─ login/page.tsx        # Email magic link 登入
│  ├─ auth/callback/route.ts# 登入回呼
│  ├─ reflect/page.tsx      # 反思頁（登入 + PIN）
│  ├─ api/reflect-auth/     # PIN 驗證入口（轉發 Edge Function）
│  └─ report/[token]/       # 主管唯讀分享頁
├─ utils/supabase/          # client/server/middleware client
├─ lib/reflect.ts           # 反思頁資料存取與計分
├─ proxy.ts                 # session 刷新 + 路由保護（Next 16）
├─ supabase/
│  ├─ schema.sql            # 完整資料庫 schema
│  └─ functions/
│     ├─ verify-pin/        # PIN 後端驗證
│     └─ read-share/        # 唯讀分享（service_role 讀）
├─ .github/workflows/keep-alive.yml
└─ .env.example
```
