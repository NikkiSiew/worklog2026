// 唯讀分享頁（給主管/同事，不需登入）
// 走 read-share Edge Function，不直連 DB；反思資料無路徑可達。
// 此頁為 Server Component，於伺服器端 fetch，主管瀏覽器拿不到任何金鑰。
type PageProps = { params: Promise<{ token: string }> }

const LEVERAGE_LABELS: Record<string, string> = {
  strategic: '策略突破',
  operational: '常態維運',
  systematic: '系統優化',
  exploration: '新知探索',
}

async function fetchShare(token: string) {
  const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/read-share?token=${encodeURIComponent(
    token
  )}`
  const res = await fetch(fnUrl, {
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
    },
    cache: 'no-store',
  })
  return res.json()
}

type Snapshot = {
  draft?: {
    decisions?: string
    proposals?: string
    notices?: string
    achievements?: string
    diagnosis?: string
  }
  summary?: {
    totalHours?: number
    corePct?: number
    deptPct?: number
    leverage?: { key: string; hours: number; pct: number }[]
  }
  nextWeek?: { id: string; name: string; priority: string; leverage: string | null }[]
}

export default async function ReportPage({ params }: PageProps) {
  const { token } = await params
  const result = await fetchShare(token)

  if (!result?.ok || !result?.data?.weekly) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#ECE7D1] p-6">
        <p className="text-sm text-[#a39c84]">連結無效或已過期。</p>
      </main>
    )
  }

  const w = result.data.weekly as {
    week_start: string
    week_end: string
    published_at: string | null
    snapshot: Snapshot | null
  }
  const snap = w.snapshot ?? {}
  const d = snap.draft ?? {}
  const s = snap.summary ?? {}

  return (
    <main className="min-h-screen bg-[#ECE7D1] p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 inline-block rounded-full bg-white px-3 py-1 text-xs text-[#a39c84]">
          唯讀週報分享
        </div>
        <h1 className="text-xl font-semibold text-[#3a3527]">本週進度</h1>
        <p className="mt-1 text-sm text-[#a39c84]">
          {w.week_start} – {w.week_end}
          {typeof s.totalHours === 'number' && ` · 共投入 ${s.totalHours}h`}
        </p>

        {/* 時間健康度 */}
        {s.leverage && s.leverage.length > 0 && (
          <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="font-medium text-[#3a3527]">時間資產健康度</h2>
            <div className="mt-2 flex gap-6 text-sm">
              <span className="text-[#6b7459]">核心 {s.corePct}%</span>
              <span className="text-[#a39c84]">支援 {s.deptPct}%</span>
            </div>
            <div className="mt-3 space-y-2">
              {s.leverage.map((l) => (
                <div key={l.key}>
                  <div className="flex justify-between text-xs text-[#6b6450]">
                    <span>{LEVERAGE_LABELS[l.key] ?? l.key}</span>
                    <span>{l.hours}h · {l.pct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-[#DBCEA5]">
                    <div className="h-full rounded-full bg-[#8E977D]" style={{ width: `${l.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 需要主管的事 */}
        {(d.decisions || d.proposals || d.notices) && (
          <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="font-medium text-[#3a3527]">需要您的事</h2>
            <div className="mt-3 space-y-3 text-sm text-[#3a3527]">
              {d.decisions && <Field label="待裁示" text={d.decisions} />}
              {d.proposals && <Field label="提案" text={d.proposals} />}
              {d.notices && <Field label="知會" text={d.notices} />}
            </div>
          </section>
        )}

        {/* 核心戰果 */}
        {d.achievements && (
          <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="font-medium text-[#3a3527]">核心戰果與價值交付</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-[#3a3527]">{d.achievements}</p>
          </section>
        )}

        {/* 系統耗損診斷 */}
        {d.diagnosis && (
          <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="font-medium text-[#3a3527]">系統耗損與流程診斷</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-[#3a3527]">{d.diagnosis}</p>
          </section>
        )}

        {/* 下週佈局 */}
        {snap.nextWeek && snap.nextWeek.length > 0 && (
          <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="font-medium text-[#3a3527]">下週關鍵佈局</h2>
            <div className="mt-3 space-y-2">
              {snap.nextWeek.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm text-[#3a3527]">
                  <span className="rounded-full bg-[#DBCEA5] px-2 py-0.5 text-xs text-[#8A7650]">
                    {t.priority}
                  </span>
                  <span>{t.name}</span>
                  {t.leverage && (
                    <span className="text-xs text-[#a39c84]">
                      {LEVERAGE_LABELS[t.leverage] ?? t.leverage}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="mt-6 text-xs text-[#a39c84]">
          此連結僅供檢視，無法編輯，也無法存取其他頁面。發布時間：
          {w.published_at ? new Date(w.published_at).toLocaleString() : '—'}
        </p>
      </div>
    </main>
  )
}

function Field({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <span className="rounded-full bg-[#8E977D] px-2 py-0.5 text-xs text-white">{label}</span>
      <p className="mt-1 whitespace-pre-wrap">{text}</p>
    </div>
  )
}
