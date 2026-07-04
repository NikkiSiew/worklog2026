// 記錄頁資料存取
// 對應 schema-stage234.sql 的 tasks（含 is_scheduled 待排/已排）
// 與 recurring_items（循環項目）。
// 今日時間構成為讀取彙整，不需新表。
import { createClient } from '@/utils/supabase/client'

export type RecordTask = {
  id: string
  project_id: string | null
  name: string
  leverage: string | null
  priority: string | null
  planned_hours: number | null
  actual_hours: number
  status: string // planned / on-plan / interrupt / displaced
  ownership: string // core / dept
  scheduled_date: string | null
  is_scheduled: boolean
  time_start: string | null
  time_end: string | null
  is_done: boolean
  version: number
  source_recurring_id: string | null
  source_period_key: string | null
}

export type RecurringItem = {
  id: string
  name: string
  frequency: string
  weekday: number | null
  anchor_date: string | null
  day_of_month: number | null
  week_of_month: number | null
  time_start: string | null
  time_end: string | null
  leverage: string | null
}

// 取某日的 task（已排：有 scheduled_date 且 is_scheduled）
export async function fetchTasksByDate(date: string): Promise<RecordTask[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('scheduled_date', date)
    .order('time_start')
  if (error) throw error
  return (data ?? []) as RecordTask[]
}

// 取待排 Inbox（is_scheduled = false）
export async function fetchInbox(): Promise<RecordTask[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('is_scheduled', false)
    .eq('is_done', false)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as RecordTask[]
}

// 丟一筆到 Inbox（待排）
export async function addToInbox(
  name: string,
  leverage: string | null
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('tasks')
    .insert({ name, leverage, is_scheduled: false })
  if (error) throw error
}

// 把 Inbox 項目排進某時段（待排 → 已排）
export async function scheduleTask(
  taskId: string,
  date: string,
  start: string,
  end: string
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('tasks')
    .update({
      is_scheduled: true,
      scheduled_date: date,
      time_start: start,
      time_end: end,
    })
    .eq('id', taskId)
  if (error) throw error
}

// 補登 / 編輯實際時數
export async function updateActualHours(
  taskId: string,
  actual: number
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('tasks')
    .update({ actual_hours: actual })
    .eq('id', taskId)
  if (error) throw error
}

// 今日時間構成彙整（讀取層，前端算）
// [已查證:原型「計劃執行 如期/插斷」「時間歸屬 主責/部門支援」]
export function summarize(tasks: RecordTask[]) {
  const totalActual = tasks.reduce((s, t) => s + (t.actual_hours || 0), 0)
  const totalPlanned = tasks.reduce((s, t) => s + (t.planned_hours || 0), 0)
  // 如期 vs 插斷（依 status）
  const onPlan = tasks
    .filter((t) => t.status === 'on-plan' || t.status === 'planned')
    .reduce((s, t) => s + (t.actual_hours || 0), 0)
  const interrupt = tasks
    .filter((t) => t.status === 'interrupt')
    .reduce((s, t) => s + (t.actual_hours || 0), 0)
  // 主責 vs 部門支援（依 ownership）
  const core = tasks
    .filter((t) => t.ownership === 'core')
    .reduce((s, t) => s + (t.actual_hours || 0), 0)
  const dept = tasks
    .filter((t) => t.ownership === 'dept')
    .reduce((s, t) => s + (t.actual_hours || 0), 0)
  const pct = (part: number) =>
    totalActual > 0 ? Math.round((part / totalActual) * 100) : 0
  return {
    totalActual,
    totalPlanned,
    onPlan,
    interrupt,
    core,
    dept,
    onPlanPct: pct(onPlan),
    interruptPct: pct(interrupt),
    corePct: pct(core),
    deptPct: pct(dept),
  }
}

export async function fetchRecurring(): Promise<RecurringItem[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('recurring_items')
    .select('*')
    .order('weekday')
  if (error) throw error
  return (data ?? []) as RecurringItem[]
}

// ===== 拖曳排程（半小時格）+ 樂觀鎖 =====
// 你的決定:半小時格、Realtime + 樂觀鎖兩層。

// 半小時格時間軸:每天 08:00–20:00，每格 30 分。
export const DAY_START_MIN = 8 * 60 // 08:00
export const DAY_END_MIN = 20 * 60 // 20:00
export const SLOT_MIN = 30 // 半小時格

export function minToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
export function timeToMin(t: string | null): number | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// 樂觀鎖排程:把 task 排到某半小時格起點。
// 帶 WHERE version = 舊值;影響 0 筆 = 衝突。
// 回傳 'ok' | 'conflict' | 拋錯。
// [已查證:OCC 標準做法,hrekov.com 2026]
export async function scheduleTaskOCC(
  taskId: string,
  knownVersion: number,
  date: string,
  startMin: number,
  durationMin: number
): Promise<'ok' | 'conflict'> {
  const supabase = createClient()
  const start = minToTime(startMin)
  const end = minToTime(startMin + durationMin)
  const { data, error } = await supabase
    .from('tasks')
    .update({
      is_scheduled: true,
      scheduled_date: date,
      time_start: start,
      time_end: end,
      version: knownVersion + 1,
    })
    .eq('id', taskId)
    .eq('version', knownVersion) // 樂觀鎖:版本須相符
    .select()
  if (error) throw error
  // 影響 0 筆 = 別的裝置先改了版本
  if (!data || data.length === 0) return 'conflict'
  return 'ok'
}

// 訂閱 tasks 表變更（Realtime / Postgres Changes）。
// 回傳取消訂閱函式。
// [已查證:supabase.com/docs/guides/realtime/postgres-changes]
export function subscribeTasks(onChange: () => void): () => void {
  const supabase = createClient()
  const channel = supabase
    .channel('tasks-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tasks' },
      () => onChange()
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

// ===== 循環項目自動排入（打開那週才生成）=====
// 你的決定:實體化、打開那週才生成、單次刪除不影響後續週。
import { occurrenceInWeek, type RecurringRule } from '@/lib/recurrence'

// 取某週一所在週,確保所有 active 循環項目都已生成 task（缺的補上）。
// 略過已生成、已在 recurring_skips 標記的。
export async function ensureRecurringForWeek(weekMonday: Date): Promise<void> {
  const supabase = createClient()
  const rules = (await fetchRecurring()) as unknown as RecurringRule[]
  if (!rules.length) return

  // 取這週期已略過的記錄
  const { data: skips } = await supabase.from('recurring_skips').select('*')
  const skipSet = new Set(
    (skips ?? []).map((s) => `${s.recurring_id}:${s.period_key}`)
  )

  for (const rule of rules) {
    const occ = occurrenceInWeek(rule, weekMonday)
    if (!occ) continue // 這週期該規則不排
    const key = `${rule.id}:${occ.periodKey}`
    if (skipSet.has(key)) continue // 被單次刪除略過

    // 檢查是否已生成過（同 source + period_key）
    const { data: existing } = await supabase
      .from('tasks')
      .select('id')
      .eq('source_recurring_id', rule.id)
      .eq('source_period_key', occ.periodKey)
      .limit(1)
    if (existing && existing.length) continue // 已生成

    // 補生成一筆真 task
    const dateISO = occ.date.toISOString().slice(0, 10)
    // 從循環項目的時段算 planned_hours,避免時間軸有排程但計劃時數漏算。
    // [輪3 debug:原本循環 task 無 planned_hours,導致時間軸顯示與
    //  「計劃總時數」彙整對不上。]
    let plannedHours: number | null = null
    if (rule.time_start && rule.time_end) {
      const [sh, sm] = rule.time_start.split(':').map(Number)
      const [eh, em] = rule.time_end.split(':').map(Number)
      const mins = eh * 60 + em - (sh * 60 + sm)
      if (mins > 0) plannedHours = Math.round((mins / 60) * 100) / 100
    }
    await supabase.from('tasks').insert({
      name: rule.name,
      leverage: rule.leverage,
      planned_hours: plannedHours,
      scheduled_date: dateISO,
      time_start: rule.time_start,
      time_end: rule.time_end,
      is_scheduled: true,
      source_recurring_id: rule.id,
      source_period_key: occ.periodKey,
    })
  }
}

// 單次刪除某循環生成的 task:刪 task + 寫 skip（這週期不再補）。
export async function deleteRecurringOccurrence(
  taskId: string,
  recurringId: string,
  periodKey: string
): Promise<void> {
  const supabase = createClient()
  const { error: e1 } = await supabase.from('tasks').delete().eq('id', taskId)
  if (e1) throw e1
  const { error: e2 } = await supabase
    .from('recurring_skips')
    .upsert(
      { recurring_id: recurringId, period_key: periodKey },
      { onConflict: 'recurring_id,period_key' }
    )
  if (e2) throw e2
}

// 循環項目 CRUD（管理介面用）
export async function createRecurring(
  item: Partial<RecurringItem> & { name: string }
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('recurring_items').insert(item)
  if (error) throw error
}
export async function updateRecurring(
  id: string,
  patch: Partial<RecurringItem>
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('recurring_items')
    .update(patch)
    .eq('id', id)
  if (error) throw error
}
export async function deleteRecurring(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('recurring_items').delete().eq('id', id)
  if (error) throw error
}

// 刪一般 task（非循環生成的）
export async function deleteTask(taskId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('tasks').delete().eq('id', taskId)
  if (error) throw error
}

// 更新 task 的計劃執行狀態（如期/插斷/讓位）與時間歸屬（主責/部門）
// [debug loop 修正:原本 summarize 依賴這些值,但前端無處可寫,
//  導致「計劃執行」「時間歸屬」彙整永遠失準。補上編輯入口。]
export async function updateTaskStatus(
  taskId: string,
  status: string
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('tasks')
    .update({ status })
    .eq('id', taskId)
  if (error) throw error
}

export async function updateTaskOwnership(
  taskId: string,
  ownership: string
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('tasks')
    .update({ ownership })
    .eq('id', taskId)
  if (error) throw error
}

// 更新 task 的核心屬性（專案、優先序、分類、計劃時數）
// [使用者路徑 debug 修正:原本 task 建出後無法設這些屬性,
//  導致所有彙整頁讀不到資料。這是整個 app 的核心資料流斷點。]
export async function updateTaskAttrs(
  taskId: string,
  attrs: {
    project_id?: string | null
    priority?: string | null
    leverage?: string | null
    planned_hours?: number | null
  }
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('tasks').update(attrs).eq('id', taskId)
  if (error) throw error
}

// 給記錄頁/對齊頁用:列出所有專案（設 project_id 用）
export async function fetchProjectOptions(): Promise<
  { id: string; name: string }[]
> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('projects')
    .select('id, name')
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as { id: string; name: string }[]
}
