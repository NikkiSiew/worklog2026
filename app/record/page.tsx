'use client'

// 記錄頁（第一部分：彙整 + 記錄 + Inbox + 已排顯示/編輯）
// 拖曳時間軸為第二部分（另一輪實作）。
// 視覺沿用原型 tokens（globals.css）。
import { useEffect, useState, useCallback } from 'react'
import {
  fetchTasksByDate,
  fetchInbox,
  addToInbox,
  updateActualHours,
  updateTaskStatus,
  updateTaskOwnership,
  updateTaskAttrs,
  fetchProjectOptions,
  summarize,
  type RecordTask,
} from '@/lib/records'
import Timeline from './Timeline'

const LEVERAGE_LABELS: Record<string, string> = {
  strategic: '策略突破',
  operational: '常態維運',
  systematic: '系統優化',
  exploration: '新知探索',
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function RecordPage() {
  const [date, setDate] = useState(todayISO())
  const [dayTasks, setDayTasks] = useState<RecordTask[]>([])
  const [inboxTasks, setInboxTasks] = useState<RecordTask[]>([])
  const [projectOpts, setProjectOpts] = useState<{ id: string; name: string }[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [newIdea, setNewIdea] = useState('')

  const load = useCallback(async () => {
    try {
      const [dt, ib, po] = await Promise.all([
        fetchTasksByDate(date),
        fetchInbox(),
        fetchProjectOptions(),
      ])
      setDayTasks(dt)
      setInboxTasks(ib)
      setProjectOpts(po)
    } catch (e) {
      setErr(String(e))
    }
  }, [date])

  useEffect(() => {
    load()
  }, [load])

  const s = summarize(dayTasks)

  async function handleAddIdea() {
    if (!newIdea.trim()) return
    try {
      await addToInbox(newIdea.trim(), null)
      setNewIdea('')
      await load()
    } catch (e) {
      setErr(String(e))
    }
  }

  async function handleEditHours(task: RecordTask) {
    const v = window.prompt('實際時數（h）', String(task.actual_hours))
    if (v == null) return
    const n = Number(v)
    if (Number.isNaN(n)) return
    try {
      await updateActualHours(task.id, n)
      await load()
    } catch (e) {
      setErr(String(e))
    }
  }

  async function handleStatus(taskId: string, status: string) {
    try {
      await updateTaskStatus(taskId, status)
      await load()
    } catch (e) {
      setErr(String(e))
    }
  }
  async function handleOwnership(taskId: string, ownership: string) {
    try {
      await updateTaskOwnership(taskId, ownership)
      await load()
    } catch (e) {
      setErr(String(e))
    }
  }

  async function handleAttr(
    taskId: string,
    attrs: {
      project_id?: string | null
      priority?: string | null
      leverage?: string | null
      planned_hours?: number | null
    }
  ) {
    try {
      await updateTaskAttrs(taskId, attrs)
      await load()
    } catch (e) {
      setErr(String(e))
    }
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--ink)' }}>
              記錄
            </h1>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              今日時間構成 · 工作項 · 待排 Inbox
            </p>
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--lemon)' }}
          />
        </header>

        {err && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            操作失敗：{err}
            <p className="mt-1 text-xs text-red-500">
              若為連線錯誤，請確認 Supabase 已設定且 schema 已執行。
            </p>
          </div>
        )}

        {/* 今日時間構成 */}
        <section className="card mb-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-medium" style={{ color: 'var(--ink)' }}>
              今日時間構成
            </h2>
            <span className="text-sm" style={{ color: 'var(--muted)' }}>
              計劃 {s.totalPlanned}h · 實際 {s.totalActual}h
            </span>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Breakdown
              title="計劃執行"
              subtitle="我的計劃跑得如何"
              aLabel="如期 On-plan"
              aHours={s.onPlan}
              aPct={s.onPlanPct}
              bLabel="插斷 Interrupt"
              bHours={s.interrupt}
              bPct={s.interruptPct}
            />
            <Breakdown
              title="時間歸屬"
              subtitle="這時間是不是我的主責"
              aLabel="我的主責 Core"
              aHours={s.core}
              aPct={s.corePct}
              bLabel="部門支援 Dept."
              bHours={s.dept}
              bPct={s.deptPct}
            />
          </div>
        </section>

        {/* 今日已排 task：狀態/歸屬/時數編輯（讓彙整有真實資料） */}
        {(dayTasks.length > 0 || inboxTasks.length > 0) && (
          <section className="card mb-4">
            <h2 className="mb-1 font-medium" style={{ color: 'var(--ink)' }}>
              工作項屬性
            </h2>
            <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
              設定專案、優先序、分類，這些 task 才會出現在對齊頁、Dashboard 與專案完成度
            </p>
            <div className="space-y-2">
              {[...inboxTasks, ...dayTasks].map((t) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg p-2 text-sm"
                  style={{ background: '#F7F3E3' }}
                >
                  <span className="mr-auto font-medium" style={{ color: 'var(--ink)' }}>
                    {t.name}
                    {!t.is_scheduled && (
                      <span className="ml-1 text-xs" style={{ color: 'var(--muted)' }}>
                        (待排)
                      </span>
                    )}
                  </span>
                  {/* 專案 */}
                  <select
                    value={t.project_id ?? ''}
                    onChange={(e) =>
                      handleAttr(t.id, { project_id: e.target.value || null })
                    }
                    className="rounded border px-1.5 py-1 text-xs"
                    style={{ borderColor: 'var(--lemon)' }}
                    title="所屬專案"
                  >
                    <option value="">無專案</option>
                    {projectOpts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {/* 優先序 */}
                  <select
                    value={t.priority ?? ''}
                    onChange={(e) =>
                      handleAttr(t.id, { priority: e.target.value || null })
                    }
                    className="rounded border px-1.5 py-1 text-xs"
                    style={{ borderColor: 'var(--lemon)' }}
                    title="優先序"
                  >
                    <option value="">無</option>
                    <option value="P1">P1</option>
                    <option value="P2">P2</option>
                    <option value="P3">P3</option>
                  </select>
                  {/* 分類 */}
                  <select
                    value={t.leverage ?? ''}
                    onChange={(e) =>
                      handleAttr(t.id, { leverage: e.target.value || null })
                    }
                    className="rounded border px-1.5 py-1 text-xs"
                    style={{ borderColor: 'var(--lemon)' }}
                    title="槓桿分類"
                  >
                    <option value="">分類</option>
                    <option value="strategic">策略突破</option>
                    <option value="operational">常態維運</option>
                    <option value="systematic">系統優化</option>
                    <option value="exploration">新知探索</option>
                  </select>
                  {/* 計劃時數 */}
                  <button
                    onClick={() => {
                      const v = window.prompt('計劃時數（h）', String(t.planned_hours ?? ''))
                      if (v == null) return
                      const n = Number(v)
                      if (Number.isNaN(n)) return
                      handleAttr(t.id, { planned_hours: n })
                    }}
                    className="text-xs underline"
                    style={{ color: 'var(--green-deep)' }}
                    title="計劃時數"
                  >
                    計劃 {t.planned_hours ?? 0}h
                  </button>
                  {/* 已排 task 才顯示狀態/歸屬/實際時數 */}
                  {t.is_scheduled && (
                    <>
                      <select
                        value={t.status}
                        onChange={(e) => handleStatus(t.id, e.target.value)}
                        className="rounded border px-1.5 py-1 text-xs"
                        style={{ borderColor: 'var(--lemon)' }}
                        title="計劃執行"
                      >
                        <option value="planned">計劃中</option>
                        <option value="on-plan">如期</option>
                        <option value="interrupt">插斷</option>
                        <option value="displaced">讓位</option>
                      </select>
                      <select
                        value={t.ownership}
                        onChange={(e) => handleOwnership(t.id, e.target.value)}
                        className="rounded border px-1.5 py-1 text-xs"
                        style={{ borderColor: 'var(--lemon)' }}
                        title="時間歸屬"
                      >
                        <option value="core">主責</option>
                        <option value="dept">部門支援</option>
                      </select>
                      <button
                        onClick={() => handleEditHours(t)}
                        className="text-xs underline"
                        style={{ color: 'var(--green-deep)' }}
                      >
                        實際 {t.actual_hours}h
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 新增想法到 Inbox */}
        <section className="card mb-4">
          <div className="flex gap-2">
            <input
              value={newIdea}
              onChange={(e) => setNewIdea(e.target.value)}
              placeholder="丟一個想法進 Inbox（之後拖到時間軸排程）"
              className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--lemon)' }}
            />
            <button onClick={handleAddIdea} className="btn-primary">
              加入 Inbox
            </button>
          </div>
        </section>

        {/* 拖曳時間軸（半小時格 + Realtime + 樂觀鎖） */}
        <Timeline date={date} />
      </div>
    </main>
  )
}

function Breakdown({
  title,
  subtitle,
  aLabel,
  aHours,
  aPct,
  bLabel,
  bHours,
  bPct,
}: {
  title: string
  subtitle: string
  aLabel: string
  aHours: number
  aPct: number
  bLabel: string
  bHours: number
  bPct: number
}) {
  return (
    <div>
      <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
        {title}
      </div>
      <div className="text-xs" style={{ color: 'var(--muted)' }}>
        {subtitle}
      </div>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full" style={{ background: 'var(--lemon)' }}>
        <div style={{ width: `${aPct}%`, background: 'var(--green)' }} />
        <div style={{ width: `${bPct}%`, background: 'var(--green-soft)' }} />
      </div>
      <div className="mt-2 flex justify-between text-xs" style={{ color: 'var(--ink-soft)' }}>
        <span>
          {aLabel} · {aHours}h · {aPct}%
        </span>
        <span>
          {bLabel} · {bHours}h · {bPct}%
        </span>
      </div>
    </div>
  )
}
