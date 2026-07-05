'use client'

// 對齊頁：關注事項 + 本週優先序（拖曳，同記錄頁規格）+ 時間流向 + 專案清單
// 拖曳優先序:P1/P2/P3 互拖 + 組內排序,Realtime + 樂觀鎖。
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  fetchPriorityTasks,
  fetchTimeFlow,
  fetchOwnershipSplit,
  fetchAttention,
  fetchProjectsForAlign,
  fetchKpiOptions,
  fetchProjectKpis,
  setProjectKpis,
  reorderWithinPriority,
  subscribeAlign,
  LEVERAGE_META,
  type AlignTask,
  type TimeFlow,
  type ProjectRow,
  type ProjectProgressRow,
  type KpiLite,
} from '@/lib/align'

const PRIORITIES = ['P1', 'P2', 'P3'] as const
const P1_LIMIT = 3
const PRIORITY_META: Record<string, string> = {
  P1: '最重要 · 優先處理',
  P2: '重要 · 本週要做',
  P3: '有空再做',
}

export default function AlignPage() {
  const [tasks, setTasks] = useState<AlignTask[]>([])
  const [timeFlow, setTimeFlow] = useState<TimeFlow[]>([])
  const [ownership, setOwnership] = useState({ core: 0, dept: 0 })
  const [attention, setAttention] = useState({ pending: 0, blockers: 0 })
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [progress, setProgress] = useState<Record<string, ProjectProgressRow>>({})
  const [kpiOpts, setKpiOpts] = useState<KpiLite[]>([])
  const [projectKpis, setProjectKpisMap] = useState<Record<string, string[]>>({})
  const [err, setErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const dragTask = useRef<AlignTask | null>(null)

  const load = useCallback(async () => {
    try {
      const [pt, tf, os, att, pj, ko, pk] = await Promise.all([
        fetchPriorityTasks(),
        fetchTimeFlow(),
        fetchOwnershipSplit(),
        fetchAttention(),
        fetchProjectsForAlign(),
        fetchKpiOptions(),
        fetchProjectKpis(),
      ])
      setTasks(pt)
      setTimeFlow(tf)
      setOwnership(os)
      setAttention(att)
      setProjects(pj.projects)
      setProgress(pj.progress)
      setKpiOpts(ko)
      setProjectKpisMap(pk)
    } catch (e) {
      setErr(String(e))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Realtime（同記錄頁規格）
  useEffect(() => {
    const unsub = subscribeAlign(() => load())
    return unsub
  }, [load])

  const byPriority = (p: string) =>
    tasks.filter((t) => t.priority === p).sort((a, b) => a.sort_order - b.sort_order)

  const p1Count = byPriority('P1').length

  // 計算插入後的目標組 id 順序，並送出重排
  async function applyReorder(
    targetPriority: string,
    insertIndex: number | null // null=放組尾
  ) {
    const t = dragTask.current
    dragTask.current = null
    if (!t) return
    // 目標組現有順序（排除被拖的自己，避免重複）
    const group = byPriority(targetPriority).filter((x) => x.id !== t.id)
    const ids = group.map((x) => x.id)
    const idx =
      insertIndex == null || insertIndex > ids.length ? ids.length : insertIndex
    ids.splice(idx, 0, t.id) // 插入被拖的
    try {
      const r = await reorderWithinPriority(t.id, t.version, targetPriority, ids)
      if (r === 'conflict') {
        setNotice('這筆已被其他裝置更新，已為你重新整理。')
        await load()
      } else {
        setNotice(null)
        await load()
      }
    } catch (e) {
      setErr(String(e))
    }
  }

  // 拖到卡片上：依落點在卡片上半/下半，插到該卡前/後
  function onDropCard(
    e: React.DragEvent,
    targetPriority: string,
    cardIndex: number
  ) {
    e.preventDefault()
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const isUpperHalf = e.clientY < rect.top + rect.height / 2
    let insertIndex = isUpperHalf ? cardIndex : cardIndex + 1

    // off-by-one 補償:若同組拖曳、且被拖卡片原位在目標位置之前，
    // 移除自己後後方 index 會前移一位，需 -1。
    // [自審修正:組內拖曳經典位移陷阱,測試發現]
    const t = dragTask.current
    if (t && t.priority === targetPriority) {
      const group = byPriority(targetPriority)
      const fromIndex = group.findIndex((x) => x.id === t.id)
      if (fromIndex >= 0 && fromIndex < insertIndex) insertIndex -= 1
    }
    applyReorder(targetPriority, insertIndex)
  }

  const totalHours = timeFlow.reduce((s, t) => s + (t.total_hours || 0), 0)
  const ownTotal = ownership.core + ownership.dept
  const corePct = ownTotal > 0 ? Math.round((ownership.core / ownTotal) * 100) : 0
  const deptPct = ownTotal > 0 ? Math.round((ownership.dept / ownTotal) * 100) : 0
  const projName = (id: string | null) =>
    id ? projects.find((p) => p.id === id)?.name ?? '' : ''

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--ink)' }}>
            對齊
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            該做什麼、先做什麼 · 與主管對焦用
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
        {notice && (
          <div className="mb-4 rounded-lg p-3 text-sm" style={{ background: '#FBF3D9', color: 'var(--lemon-deep)' }}>
            {notice}
          </div>
        )}

        {/* 現在要關注 */}
        <section className="card mb-6">
          <h2 className="font-medium" style={{ color: 'var(--ink)' }}>
            現在要關注
          </h2>
          <div className="mt-3 flex flex-wrap gap-3 text-sm" style={{ color: 'var(--ink-soft)' }}>
            <span className="pill" style={{ background: '#FBE9E7', color: 'var(--terra)' }}>
              {attention.blockers} 個卡點未解
            </span>
            <span className="pill" style={{ background: 'var(--lemon)', color: 'var(--lemon-deep)' }}>
              {attention.pending} 個專案尚未啟動
            </span>
          </div>
        </section>

        {/* 本週優先序（拖曳） */}
        <section className="mb-6">
          <h2 className="mb-1 font-medium" style={{ color: 'var(--ink)' }}>
            本週優先序
          </h2>
          <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
            跨日彙整 · 拖曳調整優先序 · 與主管對焦用
          </p>
          {p1Count > P1_LIMIT && (
            <div className="mb-3 rounded-lg p-3 text-sm" style={{ background: '#FBE9E7', color: 'var(--terra)' }}>
              P1 超過 {P1_LIMIT} 個 — 太多 P1 等於沒有優先級，建議降一些到 P2。
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            {PRIORITIES.map((p) => {
              const group = byPriority(p)
              return (
                <div
                  key={p}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => applyReorder(p, null)}
                  className="card"
                  style={{ minHeight: 120 }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>
                      {p}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                      {p === 'P1' ? `上限 ${P1_LIMIT}` : ''}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    {PRIORITY_META[p]}
                  </p>
                  <div className="mt-3 space-y-2">
                    {group.map((t, ci) => (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={() => (dragTask.current = t)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => onDropCard(e, p, ci)}
                        className="cursor-move rounded-lg p-2 text-sm"
                        style={{ background: '#F7F3E3', color: 'var(--ink)' }}
                      >
                        <div className="font-medium">{t.name}</div>
                        <div className="text-xs" style={{ color: 'var(--muted)' }}>
                          {projName(t.project_id)}
                          {t.leverage && ` · ${LEVERAGE_META[t.leverage]?.label ?? t.leverage}`}
                        </div>
                      </div>
                    ))}
                    {group.length === 0 && (
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>
                        拖工作項到這裡
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* 時間流向 */}
        <section className="card mb-6">
          <h2 className="font-medium" style={{ color: 'var(--ink)' }}>
            時間花在哪
          </h2>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            依槓桿性質 · 共 {totalHours}h
          </p>
          <div className="mt-3 space-y-3">
            {timeFlow.map((tf) => {
              const meta = LEVERAGE_META[tf.leverage]
              const pct = totalHours > 0 ? Math.round((tf.total_hours / totalHours) * 100) : 0
              return (
                <div key={tf.leverage}>
                  <div className="flex justify-between text-sm" style={{ color: 'var(--ink)' }}>
                    <span>
                      {meta?.label ?? tf.leverage}
                      <span className="ml-2 text-xs" style={{ color: 'var(--muted)' }}>
                        {tf.total_hours}h · {meta?.sub}
                      </span>
                    </span>
                    <span>{pct}%</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full" style={{ background: 'var(--lemon)' }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--green)' }} />
                  </div>
                </div>
              )
            })}
            {timeFlow.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                尚無時數資料（記錄頁補登實際時數後顯示）。
              </p>
            )}
          </div>

          {/* 主責 vs 部門支援 */}
          <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--lemon)' }}>
            <div className="flex justify-between text-sm" style={{ color: 'var(--ink)' }}>
              <span>My Core {corePct}%</span>
              <span>Dept. Support {deptPct}%</span>
            </div>
            <div className="mt-1 flex h-2 overflow-hidden rounded-full" style={{ background: 'var(--lemon)' }}>
              <div style={{ width: `${corePct}%`, background: 'var(--green)' }} />
              <div style={{ width: `${deptPct}%`, background: 'var(--green-soft)' }} />
            </div>
            {deptPct > 20 && (
              <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                部門支援佔 {deptPct}%（{ownership.dept}h），稀釋了主責時間 — 可與主管討論如何優化。
              </p>
            )}
          </div>
        </section>

        {/* 所有專案 */}
        <section className="card">
          <h2 className="font-medium" style={{ color: 'var(--ink)' }}>
            所有專案
          </h2>
          <div className="mt-3 space-y-2">
            {projects.map((p) => (
              <ProjectKpiRow
                key={p.id}
                project={p}
                progress={progress[p.id]}
                kpiOpts={kpiOpts}
                selectedKpis={projectKpis[p.id] ?? []}
                onSaved={load}
                onError={setErr}
              />
            ))}
            {projects.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                尚無專案。
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

function ProjectKpiRow({
  project,
  progress,
  kpiOpts,
  selectedKpis,
  onSaved,
  onError,
}: {
  project: ProjectRow
  progress: ProjectProgressRow | undefined
  kpiOpts: KpiLite[]
  selectedKpis: string[]
  onSaved: () => void
  onError: (e: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [picked, setPicked] = useState<string[]>(selectedKpis)
  const kpiName = (id: string) => kpiOpts.find((k) => k.id === id)?.name ?? ''

  return (
    <div className="border-b pb-2" style={{ borderColor: 'var(--lemon)' }}>
      <div className="flex items-center gap-3 text-sm">
        <span className="mr-auto" style={{ color: 'var(--ink)' }}>
          {project.name}
          {project.is_core && (
            <span className="ml-2 pill" style={{ background: 'var(--lemon)', color: 'var(--lemon-deep)' }}>
              核心
            </span>
          )}
        </span>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          {project.status}
        </span>
        <span className="text-xs" style={{ color: 'var(--green-deep)' }}>
          {progress ? `${progress.progress_pct}%` : '0%'}
        </span>
        <button
          onClick={() => {
            setPicked(selectedKpis)
            setEditing(!editing)
          }}
          className="text-xs underline"
          style={{ color: 'var(--green-deep)' }}
        >
          對齊 KPI
        </button>
      </div>

      {/* KPI 標籤顯示 */}
      {selectedKpis.length > 0 && !editing && (
        <div className="mt-1 flex flex-wrap gap-1">
          {selectedKpis.map((kid) => (
            <span key={kid} className="pill text-xs" style={{ background: 'rgba(142,151,125,.15)', color: 'var(--green-deep)' }}>
              ↑ {kpiName(kid)}
            </span>
          ))}
        </div>
      )}

      {/* KPI 編輯（多選）*/}
      {editing && (
        <div className="mt-2 rounded-lg border p-2" style={{ borderColor: 'var(--lemon)' }}>
          <div className="space-y-1">
            {kpiOpts.map((k) => (
              <label key={k.id} className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink)' }}>
                <input
                  type="checkbox"
                  checked={picked.includes(k.id)}
                  onChange={() =>
                    setPicked((prev) =>
                      prev.includes(k.id) ? prev.filter((x) => x !== k.id) : [...prev, k.id]
                    )
                  }
                />
                {k.name}
              </label>
            ))}
            {kpiOpts.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                尚無 KPI，請先到 Dashboard 新增。
              </p>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={async () => {
                try {
                  await setProjectKpis(project.id, picked)
                  setEditing(false)
                  onSaved()
                } catch (e) {
                  onError(String(e))
                }
              }}
              className="btn-primary"
            >
              儲存
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-lg px-3 py-1.5 text-xs"
              style={{ background: 'var(--lemon)', color: 'var(--lemon-deep)' }}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
