'use client'

// 專案頁：左側專案清單，右側單專案明細（Phase 結構 + 工作項 + 卡點）
// 視覺沿用原型 tokens（globals.css）。資料接 schema-stage234 的表與 view。
import { useEffect, useState, useCallback } from 'react'
import {
  fetchProjects,
  fetchProjectProgress,
  fetchPhases,
  fetchTasks,
  fetchBlockers,
  createProject,
  type Project,
  type Phase,
  type Task,
  type Blocker,
  type ProjectProgress,
} from '@/lib/projects'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [progress, setProgress] = useState<Record<string, ProjectProgress>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  const loadProjects = useCallback(async () => {
    try {
      const [ps, pg] = await Promise.all([
        fetchProjects(),
        fetchProjectProgress(),
      ])
      setProjects(ps)
      const map: Record<string, ProjectProgress> = {}
      pg.forEach((p) => (map[p.project_id] = p))
      setProgress(map)
      // 用函式式更新避免依賴 selected（否則切換專案會多餘重抓）
      // [debug loop 修正:原本依賴 [selected] 造成每次切換全量重抓]
      setSelected((cur) => (cur == null && ps.length ? ps[0].id : cur))
    } catch (e) {
      setErr(String(e))
    }
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  async function handleAdd() {
    if (!newName.trim()) return
    try {
      await createProject(newName.trim())
      setNewName('')
      await loadProjects()
    } catch (e) {
      setErr(String(e))
    }
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--ink)' }}>
              專案總覽
            </h1>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              專案 · 階段 · 工作項 · 卡點
            </p>
          </div>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="新專案名稱"
              className="rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--lemon)' }}
            />
            <button onClick={handleAdd} className="btn-primary">
              新增專案
            </button>
          </div>
        </header>

        {err && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            讀取/寫入失敗：{err}
            <p className="mt-1 text-xs text-red-500">
              若為連線錯誤，請確認 Supabase 已設定且 schema 已執行。
            </p>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-[280px_1fr]">
          {/* 專案清單 */}
          <div className="space-y-3">
            {projects.map((p) => {
              const pg = progress[p.id]
              return (
                <button
                  key={p.id}
                  onClick={() => setSelected(p.id)}
                  className="card w-full text-left"
                  style={{
                    outline:
                      selected === p.id
                        ? '2px solid var(--green)'
                        : '2px solid transparent',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>
                      {p.name}
                    </span>
                    {p.is_core && (
                      <span
                        className="pill"
                        style={{ background: 'var(--lemon)', color: 'var(--lemon-deep)' }}
                      >
                        核心
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs" style={{ color: 'var(--muted)' }}>
                    <span>{pg ? `${pg.progress_pct}%` : '0%'}</span>
                    <span>
                      {pg ? `${pg.done_tasks}/${pg.total_tasks} 項` : '0/0 項'}
                    </span>
                    <span>{pg ? `${pg.logged_hours}h` : '0h'}</span>
                  </div>
                  {/* 進度條 */}
                  <div className="mt-2 h-1.5 rounded-full" style={{ background: 'var(--lemon)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pg?.progress_pct ?? 0}%`,
                        background: 'var(--green)',
                      }}
                    />
                  </div>
                </button>
              )
            })}
            {projects.length === 0 && !err && (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                尚無專案，從右上角新增。
              </p>
            )}
          </div>

          {/* 單專案明細 */}
          <div>
            {selected ? (
              <ProjectDetail projectId={selected} />
            ) : (
              <div className="card text-sm" style={{ color: 'var(--muted)' }}>
                選擇左側專案查看明細
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

function ProjectDetail({ projectId }: { projectId: string }) {
  const [phases, setPhases] = useState<Phase[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [blockers, setBlockers] = useState<Blocker[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetchPhases(projectId),
      fetchTasks(projectId),
      fetchBlockers(projectId),
    ])
      .then(([ph, t, b]) => {
        setPhases(ph)
        setTasks(t)
        setBlockers(b)
      })
      .catch((e) => setErr(String(e)))
  }, [projectId])

  if (err)
    return (
      <div className="card text-sm text-red-600">明細讀取失敗：{err}</div>
    )

  // 把 task 依 phase 分組（無 phase 的歸到「未分階段」）
  const tasksByPhase: Record<string, Task[]> = {}
  const noPhase: Task[] = []
  tasks.forEach((t) => {
    if (t.phase_id) {
      ;(tasksByPhase[t.phase_id] ??= []).push(t)
    } else noPhase.push(t)
  })

  return (
    <div className="space-y-4">
      {/* 階段結構 */}
      {phases.map((ph) => {
        const phTasks = tasksByPhase[ph.id] ?? []
        const done = phTasks.filter((t) => t.is_done).length
        const hours = phTasks.reduce((s, t) => s + (t.actual_hours || 0), 0)
        return (
          <div key={ph.id} className="card">
            <div className="flex items-center justify-between">
              <h3 className="font-medium" style={{ color: 'var(--ink)' }}>
                Phase {ph.seq}：{ph.name}
              </h3>
              {ph.is_current && (
                <span
                  className="pill"
                  style={{ background: 'var(--green)', color: '#fff' }}
                >
                  進行中
                </span>
              )}
            </div>
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              本階段 {done}/{phTasks.length} · 投入 {hours}h
            </p>
            <ul className="mt-3 space-y-1">
              {phTasks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-2 text-sm"
                  style={{ color: 'var(--ink)' }}
                >
                  <span>{t.is_done ? '☑' : '☐'}</span>
                  <span>{t.name}</span>
                </li>
              ))}
              {phTasks.length === 0 && (
                <li className="text-xs" style={{ color: 'var(--muted)' }}>
                  此階段尚無工作項
                </li>
              )}
            </ul>
          </div>
        )
      })}

      {noPhase.length > 0 && (
        <div className="card">
          <h3 className="font-medium" style={{ color: 'var(--ink)' }}>
            未分階段工作項
          </h3>
          <ul className="mt-3 space-y-1">
            {noPhase.map((t) => (
              <li key={t.id} className="text-sm" style={{ color: 'var(--ink)' }}>
                {t.is_done ? '☑' : '☐'} {t.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 卡點 */}
      {blockers.length > 0 && (
        <div className="card">
          <h3 className="font-medium" style={{ color: 'var(--ink)' }}>
            卡點
          </h3>
          <div className="mt-3 space-y-3">
            {blockers.map((b) => (
              <div key={b.id} className="border-l-2 pl-3" style={{ borderColor: 'var(--terra)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                    {b.task_name}
                  </span>
                  {b.severity && (
                    <span
                      className="pill"
                      style={{ background: '#fbe9e7', color: 'var(--terra)' }}
                    >
                      {b.severity}
                    </span>
                  )}
                </div>
                {b.reason && (
                  <p className="mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
                    原因：{b.reason}
                  </p>
                )}
                {b.countermeasure && (
                  <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                    對策：{b.countermeasure}
                  </p>
                )}
                {b.manager_note && (
                  <p className="mt-1 text-xs" style={{ color: 'var(--green-deep)' }}>
                    主管：{b.manager_note}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {phases.length === 0 && noPhase.length === 0 && blockers.length === 0 && (
        <div className="card text-sm" style={{ color: 'var(--muted)' }}>
          此專案尚無階段、工作項或卡點。
        </div>
      )}
    </div>
  )
}
