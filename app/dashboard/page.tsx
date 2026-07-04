'use client'

// Dashboard 指揮中心：四象限
// 1 本週核心任務(P1/P2,可勾選) 2 OKR推進 3 KPI 4 風險預警
// KPI 跌破紅線即時併入風險(你的決定)。
import { useEffect, useState, useCallback } from 'react'
import {
  fetchCoreTasks,
  toggleTaskDone,
  fetchOkrSummary,
  fetchKpis,
  isKpiBreached,
  fetchRisks,
  createRisk,
  deleteRisk,
  createKpi,
  deleteKpi,
  type DashTask,
  type DashObjective,
  type DashKR,
  type Kpi,
  type Risk,
} from '@/lib/dashboard'

export default function DashboardPage() {
  const [tasks, setTasks] = useState<DashTask[]>([])
  const [okr, setOkr] = useState<{
    objectives: DashObjective[]
    krs: DashKR[]
    okrPct: Record<string, number>
    krPct: Record<string, number>
  }>({ objectives: [], krs: [], okrPct: {}, krPct: {} })
  const [kpis, setKpis] = useState<Kpi[]>([])
  const [risks, setRisks] = useState<Risk[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [newRisk, setNewRisk] = useState('')
  const [showKpiForm, setShowKpiForm] = useState(false)

  const load = useCallback(async () => {
    try {
      const [t, o, k, r] = await Promise.all([
        fetchCoreTasks(),
        fetchOkrSummary(),
        fetchKpis(),
        fetchRisks(),
      ])
      setTasks(t)
      setOkr(o)
      setKpis(k)
      setRisks(r)
    } catch (e) {
      setErr(String(e))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // 紅線跌破的 KPI → 即時轉成風險項（不寫表）
  const breachedRisks = kpis.filter(isKpiBreached).map((k) => ({
    id: `kpi-${k.id}`,
    description: `${k.name} 跌破紅線（現值 ${k.current_value}${k.unit ?? ''} / 紅線 ${k.redline_value}${k.unit ?? ''}）`,
    source: 'auto-kpi',
  }))

  async function handleToggle(t: DashTask) {
    try {
      await toggleTaskDone(t.id, !t.is_done)
      await load()
    } catch (e) {
      setErr(String(e))
    }
  }

  async function handleAddRisk() {
    if (!newRisk.trim()) return
    try {
      await createRisk(newRisk.trim())
      setNewRisk('')
      await load()
    } catch (e) {
      setErr(String(e))
    }
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--ink)' }}>
            Dashboard 指揮中心
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            四象限：本週核心任務 / OKR推進 / 維運KPI / 風險預警
          </p>
        </header>

        {err && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            操作失敗：{err}
            <p className="mt-1 text-xs text-red-500">
              若為連線錯誤，請確認 Supabase 已設定且 schema 已執行。
            </p>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* 象限 1：本週核心任務 */}
          <section className="card">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs text-white" style={{ background: 'var(--green)' }}>
                1
              </span>
              <h2 className="font-medium" style={{ color: 'var(--ink)' }}>
                本週核心任務
              </h2>
            </div>
            <div className="space-y-2">
              {tasks.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
                  <input
                    type="checkbox"
                    checked={t.is_done}
                    onChange={() => handleToggle(t)}
                  />
                  <span style={{ textDecoration: t.is_done ? 'line-through' : 'none', opacity: t.is_done ? 0.5 : 1 }}>
                    {t.name}
                  </span>
                  <span className="ml-auto pill text-xs" style={{ background: 'var(--lemon)', color: 'var(--lemon-deep)' }}>
                    {t.priority}
                  </span>
                </label>
              ))}
              {tasks.length === 0 && (
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  尚無 P1/P2 任務（在對齊頁設定優先序）。
                </p>
              )}
            </div>
          </section>

          {/* 象限 2：OKR 季度推進 */}
          <section className="card">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs text-white" style={{ background: 'var(--green)' }}>
                2
              </span>
              <h2 className="font-medium" style={{ color: 'var(--ink)' }}>
                OKR 季度推進
              </h2>
            </div>
            <div className="space-y-3">
              {okr.objectives.map((o) => (
                <div key={o.id}>
                  <div className="flex justify-between text-sm" style={{ color: 'var(--ink)' }}>
                    <span className="font-medium">{o.objective}</span>
                    <span style={{ color: 'var(--green-deep)' }}>
                      {okr.okrPct[o.id] ?? 0}%
                    </span>
                  </div>
                  <div className="mt-1 space-y-1 pl-3">
                    {okr.krs
                      .filter((k) => k.okr_id === o.id)
                      .map((k) => (
                        <div key={k.id} className="flex justify-between text-xs" style={{ color: 'var(--muted)' }}>
                          <span>{k.title}</span>
                          <span>{okr.krPct[k.id] ?? 0}%</span>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
              {okr.objectives.length === 0 && (
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  尚無 OKR（在 OKR 頁設定）。
                </p>
              )}
            </div>
          </section>

          {/* 象限 3：常態維運 KPI */}
          <section className="card">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs text-white" style={{ background: 'var(--green)' }}>
                  3
                </span>
                <h2 className="font-medium" style={{ color: 'var(--ink)' }}>
                  常態維運 KPI
                </h2>
              </div>
              <button
                onClick={() => setShowKpiForm(!showKpiForm)}
                className="text-xs underline"
                style={{ color: 'var(--green-deep)' }}
              >
                管理 KPI
              </button>
            </div>

            {showKpiForm && (
              <KpiForm
                onSaved={async () => {
                  setShowKpiForm(false)
                  await load()
                }}
                onError={setErr}
              />
            )}

            <div className="space-y-2">
              {kpis.map((k) => {
                const breached = isKpiBreached(k)
                return (
                  <div key={k.id} className="flex items-center gap-2 text-sm">
                    <span style={{ color: 'var(--ink)' }}>{k.name}</span>
                    <span className="ml-auto" style={{ color: breached ? 'var(--terra)' : 'var(--ink)' }}>
                      {k.current_value ?? '—'}
                      {k.unit ?? ''}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                      / {k.target_value ?? '—'}
                      {k.unit ?? ''}
                    </span>
                    {breached && (
                      <span className="pill text-xs" style={{ background: '#FBE9E7', color: 'var(--terra)' }}>
                        破紅線
                      </span>
                    )}
                    <button
                      onClick={async () => {
                        if (!window.confirm('刪除這個 KPI？')) return
                        await deleteKpi(k.id)
                        await load()
                      }}
                      className="text-xs"
                      style={{ color: 'var(--muted)' }}
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
              {kpis.length === 0 && (
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  尚無 KPI。點「管理 KPI」新增要追蹤的維運指標。
                </p>
              )}
            </div>
          </section>

          {/* 象限 4：風險預警 */}
          <section className="card">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs text-white" style={{ background: 'var(--green)' }}>
                  4
                </span>
                <h2 className="font-medium" style={{ color: 'var(--ink)' }}>
                  風險預警
                </h2>
              </div>
            </div>

            <div className="mb-3 flex gap-2">
              <input
                value={newRisk}
                onChange={(e) => setNewRisk(e.target.value)}
                placeholder="記一個風險"
                className="flex-1 rounded-lg border px-2 py-1.5 text-sm outline-none"
                style={{ borderColor: 'var(--lemon)' }}
              />
              <button onClick={handleAddRisk} className="btn-primary">
                +
              </button>
            </div>

            <div className="space-y-2">
              {/* KPI 跌破紅線即時併入（不可刪，源自 KPI） */}
              {breachedRisks.map((r) => (
                <div key={r.id} className="rounded-lg p-2 text-sm" style={{ background: '#FBE9E7' }}>
                  <div style={{ color: 'var(--terra)' }}>{r.description}</div>
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    自動 · 來自 KPI 紅線
                  </span>
                </div>
              ))}
              {/* 手動存的風險 */}
              {risks.map((r) => (
                <div key={r.id} className="flex items-start gap-2 rounded-lg p-2 text-sm" style={{ background: '#F7F3E3' }}>
                  <div className="mr-auto">
                    <div style={{ color: 'var(--ink)' }}>{r.description}</div>
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                      {r.source === 'manual' ? '手動' : '自動'}
                    </span>
                  </div>
                  <button
                    onClick={async () => {
                      await deleteRisk(r.id)
                      await load()
                    }}
                    className="text-xs"
                    style={{ color: 'var(--muted)' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {breachedRisks.length === 0 && risks.length === 0 && (
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  目前無風險。KPI 跌破紅線會自動出現在這裡。
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

function KpiForm({
  onSaved,
  onError,
}: {
  onSaved: () => void
  onError: (e: string) => void
}) {
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [redline, setRedline] = useState('')
  const [unit, setUnit] = useState('')
  const [direction, setDirection] = useState('higher')
  const [current, setCurrent] = useState('')
  const [freq, setFreq] = useState('weekly')
  const [source, setSource] = useState('new')

  async function save() {
    if (!name.trim()) return
    try {
      await createKpi({
        name: name.trim(),
        target_value: target ? Number(target) : null,
        redline_value: redline ? Number(redline) : null,
        unit: unit || null,
        direction,
        current_value: current ? Number(current) : null,
        review_frequency: freq,
        source,
      })
      onSaved()
    } catch (e) {
      onError(String(e))
    }
  }

  return (
    <div className="mb-3 rounded-lg border p-3" style={{ borderColor: 'var(--lemon)' }}>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="KPI 名稱" className="col-span-2 rounded border px-2 py-1" style={{ borderColor: 'var(--lemon)' }} />
        <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="目標值" className="rounded border px-2 py-1" style={{ borderColor: 'var(--lemon)' }} />
        <input value={redline} onChange={(e) => setRedline(e.target.value)} placeholder="紅線值（跌破=危機）" className="rounded border px-2 py-1" style={{ borderColor: 'var(--lemon)' }} />
        <input value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="目前實際值（選填）" className="rounded border px-2 py-1" style={{ borderColor: 'var(--lemon)' }} />
        <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="單位（如 % h）" className="rounded border px-2 py-1" style={{ borderColor: 'var(--lemon)' }} />
        <select value={direction} onChange={(e) => setDirection(e.target.value)} className="rounded border px-2 py-1" style={{ borderColor: 'var(--lemon)' }}>
          <option value="higher">越高越好</option>
          <option value="lower">越低越好</option>
        </select>
        <select value={freq} onChange={(e) => setFreq(e.target.value)} className="rounded border px-2 py-1" style={{ borderColor: 'var(--lemon)' }}>
          <option value="weekly">每週</option>
          <option value="biweekly">每兩週</option>
          <option value="monthly">每月</option>
          <option value="quarterly">每季</option>
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} className="col-span-2 rounded border px-2 py-1" style={{ borderColor: 'var(--lemon)' }}>
          <option value="new">新訂的維運指標</option>
          <option value="from_kr">從 KR 畢業而來</option>
        </select>
      </div>
      <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
        紅線＝跌破就是真危機，會自動進風險預警（不只是沒達標）。
      </p>
      <button onClick={save} className="btn-primary mt-2">
        儲存 KPI
      </button>
    </div>
  )
}
