'use client'

// 循環項目管理（完整 CRUD + 四種頻率）
// 你的決定:完整—含編輯、月複/雙週。
// 頻率:每週/雙週/每月第N號/每月第K個週幾。
import { useEffect, useState, useCallback } from 'react'
import {
  fetchRecurring,
  createRecurring,
  updateRecurring,
  deleteRecurring,
  type RecurringItem,
} from '@/lib/records'

const FREQ_LABELS: Record<string, string> = {
  weekly: '每週',
  biweekly: '雙週',
  monthly_date: '每月第N號',
  monthly_weekday: '每月第K個週幾',
}
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const LEVERAGE_LABELS: Record<string, string> = {
  strategic: '策略突破',
  operational: '常態維運',
  systematic: '系統優化',
  exploration: '新知探索',
}

type Draft = Partial<RecurringItem> & { name: string }

const emptyDraft: Draft = {
  name: '',
  frequency: 'weekly',
  weekday: 1,
  anchor_date: null,
  day_of_month: null,
  week_of_month: null,
  time_start: '09:00',
  time_end: '10:00',
  leverage: null,
}

export default function RecurringPage() {
  const [items, setItems] = useState<RecurringItem[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)

  const load = useCallback(async () => {
    try {
      setItems(await fetchRecurring())
    } catch (e) {
      setErr(String(e))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function startEdit(item: RecurringItem) {
    setEditing(item.id)
    setDraft({ ...item })
  }
  function startNew() {
    setEditing('new')
    setDraft(emptyDraft)
  }
  function cancel() {
    setEditing(null)
    setDraft(emptyDraft)
  }

  async function save() {
    if (!draft.name?.trim()) return
    try {
      // 依頻率清掉不相關欄位，避免存入矛盾資料
      const clean: Draft = { ...draft }
      if (draft.frequency === 'weekly') {
        clean.anchor_date = null
        clean.day_of_month = null
        clean.week_of_month = null
      } else if (draft.frequency === 'biweekly') {
        clean.day_of_month = null
        clean.week_of_month = null
      } else if (draft.frequency === 'monthly_date') {
        clean.weekday = null
        clean.anchor_date = null
        clean.week_of_month = null
      } else if (draft.frequency === 'monthly_weekday') {
        clean.anchor_date = null
        clean.day_of_month = null
      }

      if (editing === 'new') await createRecurring(clean)
      else if (editing) await updateRecurring(editing, clean)
      cancel()
      await load()
    } catch (e) {
      setErr(String(e))
    }
  }

  async function remove(id: string) {
    if (!window.confirm('刪除這個循環項目？已生成的歷史 task 不受影響。')) return
    try {
      await deleteRecurring(id)
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
              固定排程
            </h1>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              週會、週報等循環項目 · 打開該週時自動排入時間軸
            </p>
          </div>
          <button onClick={startNew} className="btn-primary">
            新增循環項目
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

        {editing && (
          <DraftForm
            draft={draft}
            setDraft={setDraft}
            onSave={save}
            onCancel={cancel}
          />
        )}

        <div className="mt-6 space-y-3">
          {items.map((it) => (
            <div key={it.id} className="card flex items-center justify-between">
              <div>
                <div className="font-medium" style={{ color: 'var(--ink)' }}>
                  {it.name}
                </div>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>
                  {FREQ_LABELS[it.frequency] ?? it.frequency}
                  {it.weekday != null && ` · 週${WEEKDAYS[it.weekday]}`}
                  {it.day_of_month != null && ` · ${it.day_of_month}號`}
                  {it.week_of_month != null &&
                    ` · 第${it.week_of_month === 5 ? '末' : it.week_of_month}個`}
                  {it.time_start && ` · ${it.time_start.slice(0, 5)}–${it.time_end?.slice(0, 5)}`}
                  {it.leverage && ` · ${LEVERAGE_LABELS[it.leverage] ?? it.leverage}`}
                </div>
              </div>
              <div className="flex gap-3 text-xs">
                <button
                  onClick={() => startEdit(it)}
                  className="underline"
                  style={{ color: 'var(--green-deep)' }}
                >
                  編輯
                </button>
                <button
                  onClick={() => remove(it.id)}
                  className="underline"
                  style={{ color: 'var(--terra)' }}
                >
                  刪除
                </button>
              </div>
            </div>
          ))}
          {items.length === 0 && !err && (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              尚無循環項目。新增週會、週報等，系統會在你打開那週時自動排入。
            </p>
          )}
        </div>
      </div>
    </main>
  )
}

function DraftForm({
  draft,
  setDraft,
  onSave,
  onCancel,
}: {
  draft: Draft
  setDraft: (d: Draft) => void
  onSave: () => void
  onCancel: () => void
}) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })
  return (
    <div className="card space-y-3">
      <input
        value={draft.name}
        onChange={(e) => set({ name: e.target.value })}
        placeholder="名稱（如：週會）"
        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
        style={{ borderColor: 'var(--lemon)' }}
      />

      <div className="flex flex-wrap gap-2">
        {Object.entries(FREQ_LABELS).map(([k, label]) => (
          <button
            key={k}
            onClick={() => set({ frequency: k })}
            className="pill text-sm"
            style={{
              background: draft.frequency === k ? 'var(--green)' : 'var(--lemon)',
              color: draft.frequency === k ? '#fff' : 'var(--lemon-deep)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 依頻率顯示對應欄位 */}
      {(draft.frequency === 'weekly' ||
        draft.frequency === 'biweekly' ||
        draft.frequency === 'monthly_weekday') && (
        <div className="flex items-center gap-2 text-sm">
          <span style={{ color: 'var(--ink-soft)' }}>星期</span>
          <select
            value={draft.weekday ?? 1}
            onChange={(e) => set({ weekday: Number(e.target.value) })}
            className="rounded border px-2 py-1"
            style={{ borderColor: 'var(--lemon)' }}
          >
            {WEEKDAYS.map((w, i) => (
              <option key={i} value={i}>
                週{w}
              </option>
            ))}
          </select>
        </div>
      )}

      {draft.frequency === 'biweekly' && (
        <div className="flex items-center gap-2 text-sm">
          <span style={{ color: 'var(--ink-soft)' }}>基準日（從這週起每隔一週）</span>
          <input
            type="date"
            value={draft.anchor_date ?? ''}
            onChange={(e) => set({ anchor_date: e.target.value })}
            className="rounded border px-2 py-1"
            style={{ borderColor: 'var(--lemon)' }}
          />
        </div>
      )}

      {draft.frequency === 'monthly_date' && (
        <div className="flex items-center gap-2 text-sm">
          <span style={{ color: 'var(--ink-soft)' }}>每月第</span>
          <input
            type="number"
            min={1}
            max={31}
            value={draft.day_of_month ?? 1}
            onChange={(e) => set({ day_of_month: Number(e.target.value) })}
            className="w-16 rounded border px-2 py-1"
            style={{ borderColor: 'var(--lemon)' }}
          />
          <span style={{ color: 'var(--ink-soft)' }}>號</span>
        </div>
      )}

      {draft.frequency === 'monthly_weekday' && (
        <div className="flex items-center gap-2 text-sm">
          <span style={{ color: 'var(--ink-soft)' }}>每月第</span>
          <select
            value={draft.week_of_month ?? 1}
            onChange={(e) => set({ week_of_month: Number(e.target.value) })}
            className="rounded border px-2 py-1"
            style={{ borderColor: 'var(--lemon)' }}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                第{n}個
              </option>
            ))}
            <option value={5}>最後一個</option>
          </select>
          <span style={{ color: 'var(--ink-soft)' }}>個（星期見上）</span>
        </div>
      )}

      <div className="flex items-center gap-2 text-sm">
        <span style={{ color: 'var(--ink-soft)' }}>時段</span>
        <input
          type="time"
          value={draft.time_start ?? ''}
          onChange={(e) => set({ time_start: e.target.value })}
          className="rounded border px-2 py-1"
          style={{ borderColor: 'var(--lemon)' }}
        />
        <span>–</span>
        <input
          type="time"
          value={draft.time_end ?? ''}
          onChange={(e) => set({ time_end: e.target.value })}
          className="rounded border px-2 py-1"
          style={{ borderColor: 'var(--lemon)' }}
        />
      </div>

      <div className="flex gap-2">
        <button onClick={onSave} className="btn-primary">
          儲存
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm"
          style={{ background: 'var(--lemon)', color: 'var(--lemon-deep)' }}
        >
          取消
        </button>
      </div>
    </div>
  )
}
