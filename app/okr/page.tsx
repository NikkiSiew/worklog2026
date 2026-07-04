'use client'

// OKR 設定頁：Objective → KR → 連專案（多對多），進度自動彙整。
// 視覺沿用原型 tokens。schema 已備齊，無新決策點。
import { useEffect, useState, useCallback } from 'react'
import {
  fetchObjectives,
  fetchKeyResults,
  fetchOkrProgress,
  fetchKrProgress,
  fetchKrProjects,
  fetchProjectsLite,
  createObjective,
  deleteObjective,
  createKeyResult,
  deleteKeyResult,
  setKrProjects,
  type Objective,
  type KeyResult,
  type ProjectLite,
} from '@/lib/okr'

export default function OkrPage() {
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [krs, setKrs] = useState<KeyResult[]>([])
  const [okrPct, setOkrPct] = useState<Record<string, number>>({})
  const [krPct, setKrPct] = useState<Record<string, number>>({})
  const [krProjects, setKrProjectsMap] = useState<Record<string, string[]>>({})
  const [projects, setProjects] = useState<ProjectLite[]>([])
  const [err, setErr] = useState<string | null>(null)

  const [showNewObj, setShowNewObj] = useState(false)
  const [newObjText, setNewObjText] = useState('')
  const [newObjQuarter, setNewObjQuarter] = useState('2026 Q2')

  const load = useCallback(async () => {
    try {
      const [objs, krList, op, kp, krProj, projs] = await Promise.all([
        fetchObjectives(),
        fetchKeyResults(),
        fetchOkrProgress(),
        fetchKrProgress(),
        fetchKrProjects(),
        fetchProjectsLite(),
      ])
      setObjectives(objs)
      setKrs(krList)
      const om: Record<string, number> = {}
      op.forEach((r) => (om[r.okr_id] = r.progress_pct))
      setOkrPct(om)
      const km: Record<string, number> = {}
      kp.forEach((r) => (km[r.kr_id] = r.progress_pct))
      setKrPct(km)
      setKrProjectsMap(krProj)
      setProjects(projs)
    } catch (e) {
      setErr(String(e))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleAddObjective() {
    if (!newObjText.trim()) return
    try {
      await createObjective(newObjText.trim(), newObjQuarter)
      setNewObjText('')
      setShowNewObj(false)
      await load()
    } catch (e) {
      setErr(String(e))
    }
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--ink)' }}>
              OKR 季度目標設定
            </h1>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Objective → KR → 連專案 · 進度由對齊專案自動彙整
            </p>
          </div>
          <button onClick={() => setShowNewObj(true)} className="btn-primary">
            新 Objective
          </button>
        </header>

        {err && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            操作失敗：{err}
            <p className="mt-1 text-xs text-red-500">
              若為連線錯誤，請確認 Supabase 已設定且 schema 已執行。
            </p>
          </div>
        )}

        {showNewObj && (
          <div className="card mb-4 space-y-3">
            <textarea
              value={newObjText}
              onChange={(e) => setNewObjText(e.target.value)}
              placeholder="目標（Objective）— 想達成什麼質化方向"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--lemon)' }}
              rows={2}
            />
            <div className="flex items-center gap-2 text-sm">
              <span style={{ color: 'var(--ink-soft)' }}>季度</span>
              <select
                value={newObjQuarter}
                onChange={(e) => setNewObjQuarter(e.target.value)}
                className="rounded border px-2 py-1"
                style={{ borderColor: 'var(--lemon)' }}
              >
                <option>2026 Q2</option>
                <option>2026 Q3</option>
                <option>2026 Q4</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddObjective} className="btn-primary">
                建立
              </button>
              <button
                onClick={() => setShowNewObj(false)}
                className="rounded-lg px-4 py-2 text-sm"
                style={{ background: 'var(--lemon)', color: 'var(--lemon-deep)' }}
              >
                取消
              </button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {objectives.map((obj, i) => (
            <ObjectiveCard
              key={obj.id}
              index={i + 1}
              obj={obj}
              pct={okrPct[obj.id] ?? 0}
              krs={krs.filter((k) => k.okr_id === obj.id)}
              krPct={krPct}
              krProjects={krProjects}
              projects={projects}
              onChanged={load}
              onDelete={async () => {
                if (!window.confirm('刪除這個 Objective 及其下 KR？')) return
                try {
                  await deleteObjective(obj.id)
                  await load()
                } catch (e) {
                  setErr(String(e))
                }
              }}
            />
          ))}
          {objectives.length === 0 && !err && (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              尚無 Objective。從右上角新增季度目標。
            </p>
          )}
        </div>

        {/* KR vs KPI 說明 */}
        <div className="card mt-8" style={{ background: '#F7F3E3' }}>
          <h3 className="font-medium" style={{ color: 'var(--ink)' }}>
            KR 與 KPI 有什麼不同？
          </h3>
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
            兩者不是延續，是不同物種：KR 是進攻（要改變），KPI 是防守（要維持）。
            同一個指標可以這季是 KR、達標穩定後變 KPI。
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs" style={{ color: 'var(--ink-soft)' }}>
            <div>
              <div className="font-medium" style={{ color: 'var(--green-deep)' }}>
                KR（Key Result）
              </div>
              <div>要改變的目標 · 季度會結束 · 從 A 推到 B</div>
              <div>例：續訂率 75% → 85%</div>
            </div>
            <div>
              <div className="font-medium" style={{ color: 'var(--lemon-deep)' }}>
                KPI
              </div>
              <div>要維持的指標 · 持續永遠在 · 守在某條線上</div>
              <div>例：客服回應維持 &lt; 6h</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

function ObjectiveCard({
  index,
  obj,
  pct,
  krs,
  krPct,
  krProjects,
  projects,
  onChanged,
  onDelete,
}: {
  index: number
  obj: Objective
  pct: number
  krs: KeyResult[]
  krPct: Record<string, number>
  krProjects: Record<string, string[]>
  projects: ProjectLite[]
  onChanged: () => void
  onDelete: () => void
}) {
  const [addingKr, setAddingKr] = useState(false)
  const [newKr, setNewKr] = useState('')
  const projName = (id: string) =>
    projects.find((p) => p.id === id)?.name ?? '(未知專案)'

  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>
            OBJECTIVE {index} · {obj.quarter}
          </div>
          <h2 className="mt-1 font-medium" style={{ color: 'var(--ink)' }}>
            {obj.objective}
          </h2>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold" style={{ color: 'var(--green)' }}>
            {pct}%
          </div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>
            {krs.length} KR 平均
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {krs.map((kr, ki) => (
          <div key={kr.id} className="rounded-lg p-3" style={{ background: '#F7F3E3' }}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                KR{ki + 1} · {kr.title}
              </span>
              <span className="text-sm" style={{ color: 'var(--green-deep)' }}>
                {krPct[kr.id] ?? 0}%
              </span>
            </div>
            <div className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
              對齊專案：
              {(krProjects[kr.id] ?? []).length === 0
                ? '（尚未連結）'
                : (krProjects[kr.id] ?? []).map(projName).join('、')}
            </div>
            <KrProjectPicker
              krId={kr.id}
              projects={projects}
              selected={krProjects[kr.id] ?? []}
              onSaved={onChanged}
            />
            <button
              onClick={async () => {
                if (!window.confirm('刪除這個 KR？')) return
                await deleteKeyResult(kr.id)
                onChanged()
              }}
              className="mt-1 text-xs underline"
              style={{ color: 'var(--terra)' }}
            >
              刪除 KR
            </button>
          </div>
        ))}
      </div>

      {addingKr ? (
        <div className="mt-3 flex gap-2">
          <input
            value={newKr}
            onChange={(e) => setNewKr(e.target.value)}
            placeholder="KR 標題（如：續訂率 80% → 85%）"
            className="flex-1 rounded-lg border px-2 py-1.5 text-sm outline-none"
            style={{ borderColor: 'var(--lemon)' }}
          />
          <button
            onClick={async () => {
              if (!newKr.trim()) return
              await createKeyResult(obj.id, newKr.trim())
              setNewKr('')
              setAddingKr(false)
              onChanged()
            }}
            className="btn-primary"
          >
            加入
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAddingKr(true)}
          className="mt-3 text-sm underline"
          style={{ color: 'var(--green-deep)' }}
        >
          + 新增 Key Result
        </button>
      )}

      <button
        onClick={onDelete}
        className="ml-4 mt-3 text-xs underline"
        style={{ color: 'var(--terra)' }}
      >
        刪除 Objective
      </button>
    </div>
  )
}

function KrProjectPicker({
  krId,
  projects,
  selected,
  onSaved,
}: {
  krId: string
  projects: ProjectLite[]
  selected: string[]
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>(selected)

  function toggle(id: string) {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  if (!open)
    return (
      <button
        onClick={() => {
          setPicked(selected)
          setOpen(true)
        }}
        className="mt-1 text-xs underline"
        style={{ color: 'var(--green-deep)' }}
      >
        連專案（多選）
      </button>
    )

  return (
    <div className="mt-2 rounded-lg border p-2" style={{ borderColor: 'var(--lemon)' }}>
      <div className="space-y-1">
        {projects.map((p) => (
          <label key={p.id} className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink)' }}>
            <input
              type="checkbox"
              checked={picked.includes(p.id)}
              onChange={() => toggle(p.id)}
            />
            {p.name}
          </label>
        ))}
        {projects.length === 0 && (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            尚無專案可連，請先到專案頁建立。
          </p>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <button
          onClick={async () => {
            await setKrProjects(krId, picked)
            setOpen(false)
            onSaved()
          }}
          className="btn-primary"
        >
          儲存
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg px-3 py-1.5 text-xs"
          style={{ background: 'var(--lemon)', color: 'var(--lemon-deep)' }}
        >
          取消
        </button>
      </div>
    </div>
  )
}
