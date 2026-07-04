'use client'

// 週報頁：平時即時、發布時凍結快照（你的決定）
// 草稿手寫敘述即時存;彙整數字即時算;發布凍結 + 產生唯讀分享連結。
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  getOrCreateWeekly,
  saveDraft,
  summarizeWeek,
  fetchNextWeekPriorities,
  publishWeekly,
  type WeeklyReport,
  type WeeklyDraft,
} from '@/lib/weekly'

const LEVERAGE_LABELS: Record<string, string> = {
  strategic: '策略突破',
  operational: '常態維運',
  systematic: '系統優化',
  exploration: '新知探索',
}

// 取某日期所在週（週一～週日）
function weekRange(d: Date): { start: string; end: string } {
  const day = (d.getDay() + 6) % 7
  const mon = new Date(d)
  mon.setDate(d.getDate() - day)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  const iso = (x: Date) => x.toISOString().slice(0, 10)
  return { start: iso(mon), end: iso(sun) }
}

export default function WeeklyPage() {
  const [anchor, setAnchor] = useState(() => new Date())
  const [report, setReport] = useState<WeeklyReport | null>(null)
  const [summary, setSummary] = useState<{
    totalHours: number
    corePct: number
    deptPct: number
    leverage: { key: string; hours: number; pct: number }[]
  } | null>(null)
  const [nextWeek, setNextWeek] = useState<
    { id: string; name: string; priority: string; leverage: string | null }[]
  >([])
  const [err, setErr] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const range = weekRange(anchor)

  const load = useCallback(async () => {
    try {
      const [rep, sum, nx] = await Promise.all([
        getOrCreateWeekly(range.start, range.end),
        summarizeWeek(range.start, range.end),
        fetchNextWeekPriorities(),
      ])
      setReport(rep)
      setSummary(sum)
      setNextWeek(nx)
      if (rep.share_token) {
        setShareUrl(`${window.location.origin}/report/${rep.share_token}`)
      } else {
        setShareUrl(null)
      }
    } catch (e) {
      setErr(String(e))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end])

  useEffect(() => {
    load()
  }, [load])

  // 草稿即時存（debounce 800ms,避免每鍵一次請求）
  function updateDraft(patch: Partial<WeeklyDraft>) {
    if (!report) return
    const next = { ...report.draft, ...patch }
    setReport({ ...report, draft: next })
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await saveDraft(report.id, next)
        setSavedAt(new Date().toLocaleTimeString())
      } catch (e) {
        setErr(String(e))
      }
    }, 800)
  }

  async function handlePublish() {
    if (!report || !summary) return
    if (
      !window.confirm(
        '發布週報？會凍結當下的數字與內容，並產生唯讀分享連結給主管。'
      )
    )
      return
    try {
      const token = await publishWeekly(
        report,
        summary as unknown as Record<string, unknown>,
        nextWeek
      )
      setShareUrl(`${window.location.origin}/report/${token}`)
      await load()
    } catch (e) {
      setErr(String(e))
    }
  }

  if (!report || !summary) {
    return (
      <main className="min-h-screen p-6">
        <div className="mx-auto max-w-3xl">
          {err ? (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              載入失敗：{err}
              <p className="mt-1 text-xs text-red-500">
                請確認 Supabase 已設定且 schema 已執行。
              </p>
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              載入中…
            </p>
          )}
        </div>
      </main>
    )
  }

  const d = report.draft

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--ink)' }}>
              週報
            </h1>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {range.start} – {range.end} · 共投入 {summary.totalHours}h
              {report.is_published && ' · 已發布'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const prev = new Date(anchor)
                prev.setDate(prev.getDate() - 7)
                setAnchor(prev)
              }}
              className="rounded px-2 py-1 text-sm"
              style={{ background: 'var(--lemon)', color: 'var(--lemon-deep)' }}
            >
              上週
            </button>
            <button
              onClick={() => setAnchor(new Date())}
              className="rounded px-2 py-1 text-sm"
              style={{ background: 'var(--lemon)', color: 'var(--lemon-deep)' }}
            >
              本週
            </button>
            <button
              onClick={() => {
                const next = new Date(anchor)
                next.setDate(next.getDate() + 7)
                setAnchor(next)
              }}
              className="rounded px-2 py-1 text-sm"
              style={{ background: 'var(--lemon)', color: 'var(--lemon-deep)' }}
            >
              下週
            </button>
          </div>
        </header>

        {err && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            操作失敗：{err}
          </div>
        )}

        {/* 分享連結 */}
        {shareUrl && (
          <div className="card mb-4" style={{ background: '#F7F3E3' }}>
            <p className="text-sm" style={{ color: 'var(--ink)' }}>
              唯讀分享連結（給主管）：
            </p>
            <code className="mt-1 block break-all text-xs" style={{ color: 'var(--green-deep)' }}>
              {shareUrl}
            </code>
          </div>
        )}

        {/* 時間資產健康度（即時彙整） */}
        <section className="card mb-4">
          <h2 className="font-medium" style={{ color: 'var(--ink)' }}>
            時間資產健康度
          </h2>
          <div className="mt-2 flex gap-6 text-sm">
            <span style={{ color: 'var(--ink)' }}>總投入 {summary.totalHours}h</span>
            <span style={{ color: 'var(--green-deep)' }}>核心 {summary.corePct}%</span>
            <span style={{ color: 'var(--muted)' }}>支援 {summary.deptPct}%</span>
          </div>
          <div className="mt-3 space-y-2">
            {summary.leverage.map((l) => (
              <div key={l.key}>
                <div className="flex justify-between text-xs" style={{ color: 'var(--ink-soft)' }}>
                  <span>{LEVERAGE_LABELS[l.key] ?? l.key}</span>
                  <span>{l.hours}h · {l.pct}%</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full" style={{ background: 'var(--lemon)' }}>
                  <div className="h-full rounded-full" style={{ width: `${l.pct}%`, background: 'var(--green)' }} />
                </div>
              </div>
            ))}
            {summary.leverage.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                本週尚無時數（記錄頁補登後顯示）。
              </p>
            )}
          </div>
        </section>

        {/* 需要主管的 3 件事 */}
        <section className="card mb-4">
          <h2 className="font-medium" style={{ color: 'var(--ink)' }}>
            需要您的事
          </h2>
          <div className="mt-3 space-y-3">
            <DraftField label="待裁示" value={d.decisions} onChange={(v) => updateDraft({ decisions: v })} />
            <DraftField label="提案" value={d.proposals} onChange={(v) => updateDraft({ proposals: v })} />
            <DraftField label="知會" value={d.notices} onChange={(v) => updateDraft({ notices: v })} />
          </div>
        </section>

        {/* 核心戰果與價值 */}
        <section className="card mb-4">
          <h2 className="font-medium" style={{ color: 'var(--ink)' }}>
            核心戰果與價值交付
          </h2>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            產出的商業/策略意義（手寫）
          </p>
          <textarea
            value={d.achievements}
            onChange={(e) => updateDraft({ achievements: e.target.value })}
            placeholder="例：定價頁改版線框圖 — 確立新版方案結構，順利銜接設計與開發動線。"
            className="mt-2 w-full rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--lemon)' }}
            rows={4}
          />
        </section>

        {/* 系統耗損與診斷 */}
        <section className="card mb-4">
          <h2 className="font-medium" style={{ color: 'var(--ink)' }}>
            系統耗損與流程診斷
          </h2>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            把個人壓力轉成流程議題（手寫）
          </p>
          <textarea
            value={d.diagnosis}
            onChange={(e) => updateDraft({ diagnosis: e.target.value })}
            placeholder="例：跨部門資料格式不一，導致補登摩擦力高 — 建議標準化報表格式。"
            className="mt-2 w-full rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--lemon)' }}
            rows={3}
          />
        </section>

        {/* 下週關鍵佈局（讀對齊頁 P1/P2，即時同步） */}
        <section className="card mb-4">
          <h2 className="font-medium" style={{ color: 'var(--ink)' }}>
            下週關鍵佈局
          </h2>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            來自對齊頁的 P1/P2（即時同步）
          </p>
          <div className="mt-3 space-y-2">
            {nextWeek.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-sm">
                <span className="pill text-xs" style={{ background: 'var(--lemon)', color: 'var(--lemon-deep)' }}>
                  {t.priority}
                </span>
                <span style={{ color: 'var(--ink)' }}>{t.name}</span>
                {t.leverage && (
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    {LEVERAGE_LABELS[t.leverage] ?? t.leverage}
                  </span>
                )}
              </div>
            ))}
            {nextWeek.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                對齊頁尚無 P1/P2。
              </p>
            )}
          </div>
        </section>

        {/* 發布 */}
        <div className="flex items-center gap-3">
          <button onClick={handlePublish} className="btn-primary">
            {report.is_published ? '重新發布（更新快照）' : '發布週報'}
          </button>
          {savedAt && (
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              草稿已存 {savedAt}
            </span>
          )}
        </div>
      </div>
    </main>
  )
}

function DraftField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <span className="pill text-xs" style={{ background: 'var(--green)', color: '#fff' }}>
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none"
        style={{ borderColor: 'var(--lemon)' }}
        rows={2}
      />
    </div>
  )
}
