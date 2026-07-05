'use client'

// 專案頁：左側專案清單，右側單專案明細
// 完整 CRUD：專案屬性（含起始日）、階段、卡點、工作項
// [缺口修補:原本只能新增專案名,其餘唯讀]
import { useEffect, useState, useCallback } from 'react'
import {
  fetchProjects,
  fetchProjectProgress,
  fetchPhases,
  fetchTasks,
  fetchBlockers,
  createProject,
  updateProject,
  deleteProject,
  createPhase,
  updatePhase,
  deletePhase,
  createBlocker,
  deleteBlocker,
  createProjectTask,
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

  const selectedProject = projects.find((p) => p.id === selected)

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--ink)' }}>
              專案
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
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <button onClick={handleAdd} className="btn-primary">
              新增專案
            </button>
          </div>
        </header>

        {err && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            操作失敗：{err}
            <p className="mt-1 text-xs text-red-500">
              若為連線錯誤，請確認 Supabase 已設定且 schema 已執行。
            </p>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-[240px_1fr]">
          {/* 左側專案清單 */}
          <div className="space-y-2">
            {projects.map((p) => {
              const pg = progress[p.id]
              return (
                <button
                  key={p.id}
                  onClick={() => setSelected(p.id)}
                  className="w-full rounded-lg p-3 text-left text-sm"
                  style={{
                    background: selected === p.id ? 'var(--green)' : '#fff',
                    color: selected === p.id ? '#fff' : 'var(--ink)',
                  }}
                >
                  <div className="font-medium">{p.name}</div>
                  <div
                    className="text-xs"
                    style={{
                      color: selected === p.id ? 'rgba(255,255,255,.8)' : 'var(--muted)',
                    }}
                  >
                    {pg ? `${pg.progress_pct}% · ${pg.done_tasks}/${pg.total_tasks}` : '0%'}
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

          {/* 右側明細 */}
          <div>
            {selectedProject ? (
              <ProjectDetail
                key={selectedProject.id}
                project={selectedProject}
                progress={progress[selectedProject.id]}
                onProjectChanged={loadProjects}
              />
            ) : (
              <div className="card text-sm" style={{ color: 'var(--muted)' }}>
                選一個專案看明細。
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

function ProjectDetail({
  project,
  progress,
  onProjectChanged,
}: {
  project: Project
  progress: ProjectProgress | undefined
  onProjectChanged: () => void
}) {
  const projectId = project.id
  const [phases, setPhases] = useState<Phase[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [blockers, setBlockers] = useState<Blocker[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [editingMeta, setEditingMeta] = useState(false)

  const load = useCallback(async () => {
    try {
      const [ph, t, b] = await Promise.all([
        fetchPhases(projectId),
        fetchTasks(projectId),
        fetchBlockers(projectId),
      ])
      setPhases(ph)
      setTasks(t)
      setBlockers(b)
    } catch (e) {
      setErr(String(e))
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  // 本週應達 %（線性時程推算，純算術，非預測）
  // [你的決定:B組1,起始日+應達%]
  function expectedPct(): number | null {
    if (!project.start_date || !project.due_date) return null
    const start = new Date(project.start_date).getTime()
    const due = new Date(project.due_date).getTime()
    const now = Date.now()
    if (due <= start) return null
    const pct = Math.round(((now - start) / (due - start)) * 100)
    return Math.max(0, Math.min(100, pct))
  }
  const expPct = expectedPct()

  const tasksByPhase: Record<string, Task[]> = {}
  const noPhase: Task[] = []
  tasks.forEach((t) => {
    if (t.phase_id) (tasksByPhase[t.phase_id] ??= []).push(t)
    else noPhase.push(t)
  })

  return (
    <div className="space-y-4">
      {/* 專案屬性卡 */}
      <div className="card">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-medium" style={{ color: 'var(--ink)' }}>
              {project.name}
              {project.is_core && (
                <span className="ml-2 pill" style={{ background: 'var(--lemon)', color: 'var(--lemon-deep)' }}>
                  核心
                </span>
              )}
            </h2>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--muted)' }}>
              {project.owner && <span>負責人：{project.owner}</span>}
              {project.start_date && <span>起始：{project.start_date}</span>}
              {project.due_date && <span>截止：{project.due_date}</span>}
              <span>狀態：{project.status}</span>
            </div>
          </div>
          <button
            onClick={() => setEditingMeta(!editingMeta)}
            className="text-xs underline"
            style={{ color: 'var(--green-deep)' }}
          >
            {editingMeta ? '收合' : '編輯專案'}
          </button>
        </div>

        {/* 進度 + 本週應達 */}
        {progress && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-sm" style={{ color: 'var(--ink)' }}>
              <span>整體完成度</span>
              <span style={{ color: 'var(--green-deep)' }}>{progress.progress_pct}%</span>
            </div>
            <div className="mt-1 h-2 rounded-full" style={{ background: 'var(--lemon)' }}>
              <div className="h-full rounded-full" style={{ width: `${progress.progress_pct}%`, background: 'var(--green)' }} />
            </div>
            {expPct != null && (
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                本週應達 {expPct}%（依時程推算）· {progress.progress_pct >= expPct ? '超前' : '落後'}
              </p>
            )}
          </div>
        )}

        {editingMeta && (
          <ProjectMetaForm
            project={project}
            onSaved={() => {
              setEditingMeta(false)
              onProjectChanged()
            }}
            onDeleted={onProjectChanged}
            onError={setErr}
          />
        )}
      </div>

      {err && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">操作失敗：{err}</div>
      )}

      {/* 階段結構 */}
      {phases.map((ph) => (
        <PhaseCard
          key={ph.id}
          phase={ph}
          tasks={tasksByPhase[ph.id] ?? []}
          onChanged={load}
          onError={setErr}
        />
      ))}

      {/* 新增階段 */}
      <AddPhase
        projectId={projectId}
        nextSeq={phases.length + 1}
        onAdded={load}
        onError={setErr}
      />

      {/* 未分階段工作項 */}
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
          {noPhase.length === 0 && (
            <li className="text-xs" style={{ color: 'var(--muted)' }}>
              無
            </li>
          )}
        </ul>
        <AddTaskInline
          projectId={projectId}
          phaseId={null}
          onAdded={load}
          onError={setErr}
        />
      </div>

      {/* 卡點 */}
      <div className="card">
        <h3 className="font-medium" style={{ color: 'var(--ink)' }}>
          卡點
        </h3>
        <div className="mt-3 space-y-3">
          {blockers.map((b) => (
            <BlockerRow key={b.id} blocker={b} onChanged={load} onError={setErr} />
          ))}
          {blockers.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              目前無卡點。
            </p>
          )}
        </div>
        <AddBlocker projectId={projectId} onAdded={load} onError={setErr} />
      </div>
    </div>
  )
}

// ===== 專案屬性編輯表單 =====
function ProjectMetaForm({
  project,
  onSaved,
  onDeleted,
  onError,
}: {
  project: Project
  onSaved: () => void
  onDeleted: () => void
  onError: (e: string) => void
}) {
  const [owner, setOwner] = useState(project.owner ?? '')
  const [startDate, setStartDate] = useState(project.start_date ?? '')
  const [dueDate, setDueDate] = useState(project.due_date ?? '')
  const [status, setStatus] = useState(project.status)
  const [isCore, setIsCore] = useState(project.is_core)

  async function save() {
    try {
      await updateProject(project.id, {
        owner: owner || null,
        start_date: startDate || null,
        due_date: dueDate || null,
        status,
        is_core: isCore,
      })
      onSaved()
    } catch (e) {
      onError(String(e))
    }
  }

  async function remove() {
    if (!window.confirm('刪除整個專案？其階段、工作項、卡點都會一併刪除。')) return
    try {
      await deleteProject(project.id)
      onDeleted()
    } catch (e) {
      onError(String(e))
    }
  }

  return (
    <div className="mt-4 space-y-2 border-t pt-4" style={{ borderColor: 'var(--lemon)' }}>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>負責人</span>
          <input value={owner} onChange={(e) => setOwner(e.target.value)} className="rounded border px-2 py-1" style={{ borderColor: 'var(--lemon)' }} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>狀態</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border px-2 py-1" style={{ borderColor: 'var(--lemon)' }}>
            <option value="active">進行中</option>
            <option value="pending">尚未啟動</option>
            <option value="done">已完成</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>起始日</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded border px-2 py-1" style={{ borderColor: 'var(--lemon)' }} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>截止日</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded border px-2 py-1" style={{ borderColor: 'var(--lemon)' }} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
        <input type="checkbox" checked={isCore} onChange={(e) => setIsCore(e.target.checked)} />
        核心專案
      </label>
      <div className="flex gap-2">
        <button onClick={save} className="btn-primary">儲存</button>
        <button onClick={remove} className="rounded-lg px-4 py-2 text-sm" style={{ background: '#fbe9e7', color: 'var(--terra)' }}>
          刪除專案
        </button>
      </div>
    </div>
  )
}

// ===== 階段卡（含編輯/刪除/加工作項）=====
function PhaseCard({
  phase,
  tasks,
  onChanged,
  onError,
}: {
  phase: Phase
  tasks: Task[]
  onChanged: () => void
  onError: (e: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(phase.name)
  const done = tasks.filter((t) => t.is_done).length
  const hours = tasks.reduce((s, t) => s + (t.actual_hours || 0), 0)

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded border px-2 py-1 text-sm"
            style={{ borderColor: 'var(--lemon)' }}
          />
        ) : (
          <h3 className="font-medium" style={{ color: 'var(--ink)' }}>
            Phase {phase.seq}：{phase.name}
          </h3>
        )}
        <div className="flex items-center gap-2">
          {phase.is_current && !editing && (
            <span className="pill" style={{ background: 'var(--green)', color: '#fff' }}>
              進行中
            </span>
          )}
          {editing ? (
            <>
              <button
                onClick={async () => {
                  try {
                    await updatePhase(phase.id, { name })
                    setEditing(false)
                    onChanged()
                  } catch (e) {
                    onError(String(e))
                  }
                }}
                className="text-xs underline"
                style={{ color: 'var(--green-deep)' }}
              >
                存
              </button>
              <button
                onClick={async () => {
                  if (!window.confirm('刪除此階段？該階段的工作項會變成未分階段。')) return
                  try {
                    await deletePhase(phase.id)
                    onChanged()
                  } catch (e) {
                    onError(String(e))
                  }
                }}
                className="text-xs underline"
                style={{ color: 'var(--terra)' }}
              >
                刪
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="text-xs underline"
              style={{ color: 'var(--green-deep)' }}
            >
              編輯
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
        本階段 {done}/{tasks.length} · 投入 {hours}h
      </p>
      <ul className="mt-3 space-y-1">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
            <span>{t.is_done ? '☑' : '☐'}</span>
            <span>{t.name}</span>
          </li>
        ))}
        {tasks.length === 0 && (
          <li className="text-xs" style={{ color: 'var(--muted)' }}>
            此階段尚無工作項
          </li>
        )}
      </ul>
      <AddTaskInline
        projectId={phase.project_id}
        phaseId={phase.id}
        onAdded={onChanged}
        onError={onError}
      />
    </div>
  )
}

// ===== 新增階段 =====
function AddPhase({
  projectId,
  nextSeq,
  onAdded,
  onError,
}: {
  projectId: string
  nextSeq: number
  onAdded: () => void
  onError: (e: string) => void
}) {
  const [name, setName] = useState('')
  return (
    <div className="flex gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={`新增 Phase ${nextSeq}（如：開發階段）`}
        className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
        style={{ borderColor: 'var(--lemon)' }}
      />
      <button
        onClick={async () => {
          if (!name.trim()) return
          try {
            await createPhase(projectId, name.trim(), nextSeq)
            setName('')
            onAdded()
          } catch (e) {
            onError(String(e))
          }
        }}
        className="btn-primary"
      >
        加階段
      </button>
    </div>
  )
}

// ===== 行內新增工作項 =====
function AddTaskInline({
  projectId,
  phaseId,
  onAdded,
  onError,
}: {
  projectId: string
  phaseId: string | null
  onAdded: () => void
  onError: (e: string) => void
}) {
  const [name, setName] = useState('')
  return (
    <div className="mt-2 flex gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="＋ 新增工作項"
        className="flex-1 rounded-lg border px-2 py-1.5 text-xs outline-none"
        style={{ borderColor: 'var(--lemon)' }}
        onKeyDown={async (e) => {
          if (e.key === 'Enter' && name.trim()) {
            try {
              await createProjectTask(projectId, phaseId, name.trim())
              setName('')
              onAdded()
            } catch (err) {
              onError(String(err))
            }
          }
        }}
      />
    </div>
  )
}

// ===== 卡點列（編輯/刪除）=====
function BlockerRow({
  blocker,
  onChanged,
  onError,
}: {
  blocker: Blocker
  onChanged: () => void
  onError: (e: string) => void
}) {
  return (
    <div className="border-l-2 pl-3" style={{ borderColor: 'var(--terra)' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {blocker.task_name}
          </span>
          {blocker.severity && (
            <span className="pill" style={{ background: '#fbe9e7', color: 'var(--terra)' }}>
              {blocker.severity}
            </span>
          )}
        </div>
        <button
          onClick={async () => {
            if (!window.confirm('刪除此卡點？')) return
            try {
              await deleteBlocker(blocker.id)
              onChanged()
            } catch (e) {
              onError(String(e))
            }
          }}
          className="text-xs"
          style={{ color: 'var(--muted)' }}
        >
          ✕
        </button>
      </div>
      {blocker.reason && (
        <p className="mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
          原因：{blocker.reason}
        </p>
      )}
      {blocker.countermeasure && (
        <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
          對策：{blocker.countermeasure}
        </p>
      )}
      {blocker.manager_note && (
        <p className="mt-1 text-xs" style={{ color: 'var(--green-deep)' }}>
          主管：{blocker.manager_note}
        </p>
      )}
    </div>
  )
}

// ===== 新增卡點 =====
function AddBlocker({
  projectId,
  onAdded,
  onError,
}: {
  projectId: string
  onAdded: () => void
  onError: (e: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [taskName, setTaskName] = useState('')
  const [severity, setSeverity] = useState('注意')
  const [reason, setReason] = useState('')
  const [countermeasure, setCountermeasure] = useState('')

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 text-sm underline"
        style={{ color: 'var(--green-deep)' }}
      >
        ＋ 記一個卡點
      </button>
    )

  return (
    <div className="mt-3 space-y-2 rounded-lg border p-3" style={{ borderColor: 'var(--lemon)' }}>
      <input value={taskName} onChange={(e) => setTaskName(e.target.value)} placeholder="卡在哪個工作項" className="w-full rounded border px-2 py-1 text-sm" style={{ borderColor: 'var(--lemon)' }} />
      <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" style={{ borderColor: 'var(--lemon)' }}>
        <option value="注意">注意</option>
        <option value="嚴重">嚴重</option>
      </select>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="原因" className="w-full rounded border px-2 py-1 text-sm" style={{ borderColor: 'var(--lemon)' }} />
      <input value={countermeasure} onChange={(e) => setCountermeasure(e.target.value)} placeholder="對策" className="w-full rounded border px-2 py-1 text-sm" style={{ borderColor: 'var(--lemon)' }} />
      <div className="flex gap-2">
        <button
          onClick={async () => {
            if (!taskName.trim()) return
            try {
              await createBlocker(projectId, {
                task_name: taskName.trim(),
                severity,
                reason: reason || null,
                countermeasure: countermeasure || null,
              })
              setTaskName('')
              setReason('')
              setCountermeasure('')
              setOpen(false)
              onAdded()
            } catch (e) {
              onError(String(e))
            }
          }}
          className="btn-primary"
        >
          新增
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-xs" style={{ background: 'var(--lemon)', color: 'var(--lemon-deep)' }}>
          取消
        </button>
      </div>
    </div>
  )
}
