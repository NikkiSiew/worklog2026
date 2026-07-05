'use client'

// 拖曳時間軸（半小時格）+ Realtime 即時同步 + 樂觀鎖防衝突
// 你的決定:半小時格、Realtime + 樂觀鎖兩層。
//
// 互動:
// - Inbox 項目拖到時間軸某格 → 排入該時段（待排→已排）
// - 已排項目可再拖到別格 → 改時段
// - 每日上限警示（預設 8h）
// - 衝突時（樂觀鎖偵測）提示重新整理
//
// 誠實標記:拖放「順不順、有無 bug」需在真瀏覽器操作才知，
// 本環境只能驗證編譯與邏輯正確，無法實機拖曳測試。
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  fetchTasksByDate,
  fetchInbox,
  scheduleTaskOCC,
  subscribeTasks,
  ensureRecurringForWeek,
  deleteRecurringOccurrence,
  displaceAndReschedule,
  deleteTask,
  minToTime,
  timeToMin,
  DAY_START_MIN,
  DAY_END_MIN,
  SLOT_MIN,
  type RecordTask,
} from '@/lib/records'

const LEVERAGE_LABELS: Record<string, string> = {
  strategic: '策略突破',
  operational: '常態維運',
  systematic: '系統優化',
  exploration: '新知探索',
}
const DAILY_LIMIT_MIN = 8 * 60 // 上限 8h（超過警示）

export default function Timeline({ date }: { date: string }) {
  const [dayTasks, setDayTasks] = useState<RecordTask[]>([])
  const [inbox, setInbox] = useState<RecordTask[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const dragData = useRef<{ taskId: string; name: string; version: number; duration: number } | null>(null)

  const load = useCallback(async () => {
    try {
      // 打開那週先補生成循環項目（缺的才補，已生成/已略過跳過）
      // 你的決定:打開那週才生成。
      const d = new Date(date)
      const day = (d.getDay() + 6) % 7
      const weekMonday = new Date(d)
      weekMonday.setDate(d.getDate() - day)
      weekMonday.setHours(0, 0, 0, 0)
      await ensureRecurringForWeek(weekMonday)

      const [dt, ib] = await Promise.all([fetchTasksByDate(date), fetchInbox()])
      setDayTasks(dt)
      setInbox(ib)
    } catch (e) {
      setErr(String(e))
    }
  }, [date])

  useEffect(() => {
    load()
  }, [load])

  // Realtime:tasks 表一變動就重抓（即時同步，源頭減少衝突）
  // [已查證:supabase.com/docs/guides/realtime/postgres-changes]
  useEffect(() => {
    const unsub = subscribeTasks(() => load())
    return unsub
  }, [load])

  // 產生半小時格
  const slots: number[] = []
  for (let m = DAY_START_MIN; m < DAY_END_MIN; m += SLOT_MIN) slots.push(m)

  // 已排總時數（每日上限警示用）
  const scheduledMin = dayTasks.reduce((s, t) => {
    const a = timeToMin(t.time_start)
    const b = timeToMin(t.time_end)
    return s + (a != null && b != null ? b - a : 0)
  }, 0)
  const overLimit = scheduledMin > DAILY_LIMIT_MIN

  // 某格是否被某 task 佔用 → 回傳該 task（用於顯示）
  function taskAtSlot(min: number): RecordTask | null {
    for (const t of dayTasks) {
      const a = timeToMin(t.time_start)
      const b = timeToMin(t.time_end)
      if (a != null && b != null && min >= a && min < b) return t
    }
    return null
  }

  function onDragStartInbox(t: RecordTask) {
    // Inbox 項目預設排 1 小時（2 格）
    dragData.current = { taskId: t.id, name: t.name, version: t.version ?? 0, duration: 60 }
  }
  function onDragStartScheduled(t: RecordTask) {
    const a = timeToMin(t.time_start)
    const b = timeToMin(t.time_end)
    const dur = a != null && b != null ? b - a : 60
    dragData.current = { taskId: t.id, name: t.name, version: t.version ?? 0, duration: dur }
  }

  async function onDropSlot(startMin: number) {
    const d = dragData.current
    dragData.current = null
    if (!d) return
    // 檢查目標時段是否與現有 task 重疊（排除自己）
    const endMin = startMin + d.duration
    const occupier = dayTasks.find((t) => {
      if (t.id === d.taskId) return false
      const a = timeToMin(t.time_start)
      const b = timeToMin(t.time_end)
      if (a == null || b == null) return false
      return startMin < b && endMin > a // 區間重疊
    })
    if (occupier) {
      // B3-A:被佔用時,問是否讓位改期(把佔用者移到別天)
      // [你的決定:拖到被佔時段就問是否讓位改期]
      const yes = window.confirm(
        `這個時段被「${occupier.name}」佔用。\n要讓它改期、把位子讓給「${d.name}」嗎？`
      )
      if (!yes) {
        setNotice('已取消。可換一個空檔再排。')
        return
      }
      const to = window.prompt(`「${occupier.name}」改到哪天？(YYYY-MM-DD)`, date)
      if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        setNotice('未填有效日期，讓位取消。')
        return
      }
      const reason =
        window.prompt('改期原因？', `讓位給「${d.name}」`) ?? `讓位給「${d.name}」`
      try {
        // 先讓佔用者改期移走
        await displaceAndReschedule(occupier.id, to, reason)
        // 再把新 task 排進空出的時段
        const r = await scheduleTaskOCC(d.taskId, d.version, date, startMin, d.duration)
        if (r === 'conflict') {
          setNotice('這筆已被其他裝置更新，已為你重新整理。')
        } else {
          setNotice(`已將「${occupier.name}」改期至 ${to}，並排入「${d.name}」。`)
        }
        await load()
      } catch (e) {
        setErr(String(e))
      }
      return
    }
    try {
      const r = await scheduleTaskOCC(
        d.taskId,
        d.version,
        date,
        startMin,
        d.duration
      )
      if (r === 'conflict') {
        setNotice('這筆已被其他裝置更新，已為你重新整理。請確認後再排。')
        await load()
      } else {
        setNotice(null)
        await load()
      }
    } catch (e) {
      setErr(String(e))
    }
  }

  async function handleDelete(t: RecordTask) {
    try {
      if (t.source_recurring_id && t.source_period_key) {
        if (
          !window.confirm(
            '刪除這次的循環項目？只刪這一次，後續週仍會自動排入。'
          )
        )
          return
        await deleteRecurringOccurrence(
          t.id,
          t.source_recurring_id,
          t.source_period_key
        )
      } else {
        if (!window.confirm('刪除這個工作項？')) return
        await deleteTask(t.id)
      }
      await load()
    } catch (e) {
      setErr(String(e))
    }
  }

  return (
    <div>
      {err && (
        <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          操作失敗：{err}
          <p className="mt-1 text-xs text-red-500">
            若為連線錯誤，請確認 Supabase 已設定、schema 已執行、tasks 已加入
            Realtime publication。
          </p>
        </div>
      )}
      {notice && (
        <div className="mb-3 rounded-lg p-3 text-sm" style={{ background: '#FBF3D9', color: 'var(--lemon-deep)' }}>
          {notice}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_240px]">
        {/* 時間軸 */}
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-medium" style={{ color: 'var(--ink)' }}>
              時間軸（{date}）
            </h3>
            <span
              className="text-xs"
              style={{ color: overLimit ? 'var(--terra)' : 'var(--muted)' }}
            >
              已排 {(scheduledMin / 60).toFixed(1)}h / 上限 8h
              {overLimit && ' · 超過警示'}
            </span>
          </div>

          <div className="space-y-0.5">
            {slots.map((min) => {
              const t = taskAtSlot(min)
              const isStart = t && timeToMin(t.time_start) === min
              return (
                <div
                  key={min}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDropSlot(min)}
                  className="flex items-stretch gap-2"
                >
                  <div className="w-12 shrink-0 py-1 text-right text-xs" style={{ color: 'var(--muted)' }}>
                    {min % 60 === 0 ? minToTime(min) : ''}
                  </div>
                  <div
                    className="flex-1 rounded-md border border-dashed"
                    style={{
                      minHeight: 28,
                      borderColor: t ? 'transparent' : 'var(--lemon)',
                      background: t ? 'var(--green-soft)' : 'transparent',
                    }}
                  >
                    {isStart && t && (
                      <div
                        draggable
                        onDragStart={() => onDragStartScheduled(t)}
                        className="cursor-move rounded-md p-1.5 text-xs"
                        style={{ background: 'var(--green)', color: '#fff' }}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-medium">{t.name}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(t)
                            }}
                            className="shrink-0 opacity-80 hover:opacity-100"
                            aria-label="刪除"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="opacity-90">
                          {t.time_start?.slice(0, 5)}–{t.time_end?.slice(0, 5)}
                          {t.leverage && ` · ${LEVERAGE_LABELS[t.leverage] ?? t.leverage}`}
                          {t.source_recurring_id && ' · 循環'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Inbox（可拖） */}
        <div>
          <h3 className="mb-3 font-medium" style={{ color: 'var(--ink)' }}>
            待排 Inbox
          </h3>
          <div className="card space-y-2">
            {inbox.map((t) => (
              <div
                key={t.id}
                draggable
                onDragStart={() => onDragStartInbox(t)}
                className="cursor-move rounded-lg p-2 text-sm"
                style={{ background: '#F7F3E3', color: 'var(--ink)' }}
              >
                {t.name}
                <div className="text-xs" style={{ color: 'var(--muted)' }}>
                  拖到左側時段 →
                </div>
              </div>
            ))}
            {inbox.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Inbox 是空的。
              </p>
            )}
          </div>
          <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
            拖曳即時同步多裝置；同時編輯同一筆時會提示。
          </p>
        </div>
      </div>
    </div>
  )
}
