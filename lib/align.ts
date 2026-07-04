// 對齊頁資料存取
// 多為讀取彙整（time_flow / project_progress / projects / blockers）。
// 唯一寫入:本週優先序拖曳（更新 tasks.priority + sort_order，帶樂觀鎖）。
import { createClient } from '@/utils/supabase/client'

export type AlignTask = {
  id: string
  name: string
  project_id: string | null
  priority: string | null // P1/P2/P3
  leverage: string | null
  scheduled_date: string | null
  is_scheduled: boolean
  sort_order: number
  version: number
}

export type TimeFlow = { leverage: string; total_hours: number }

export type ProjectRow = {
  id: string
  name: string
  status: string
  is_core: boolean
}

export type ProjectProgressRow = {
  project_id: string
  progress_pct: number
  done_tasks: number
  total_tasks: number
  logged_hours: number
}

const LEVERAGE_ORDER = ['strategic', 'operational', 'systematic', 'exploration']
export const LEVERAGE_META: Record<
  string,
  { label: string; sub: string; note: string }
> = {
  strategic: { label: '策略突破', sub: '推進 OKR', note: '保護黃金時間' },
  operational: { label: '常態維運', sub: '穩住 KPI', note: '縮短／自動化' },
  systematic: { label: '系統優化', sub: '投資效率', note: '賺取未來時間' },
  exploration: { label: '新知探索', sub: '投資可能性', note: '未來突破養分' },
}

// 取所有有優先序的 task（P1/P2/P3），給對齊頁優先序區
export async function fetchPriorityTasks(): Promise<AlignTask[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tasks')
    .select(
      'id, name, project_id, priority, leverage, scheduled_date, is_scheduled, sort_order, version'
    )
    .not('priority', 'is', null)
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as AlignTask[]
}

// 時間流向（四大分類時數）
export async function fetchTimeFlow(): Promise<TimeFlow[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('time_flow').select('*')
  if (error) throw error
  const rows = (data ?? []) as TimeFlow[]
  // 依固定四分類順序排
  return rows.sort(
    (a, b) =>
      LEVERAGE_ORDER.indexOf(a.leverage) - LEVERAGE_ORDER.indexOf(b.leverage)
  )
}

// 主責 vs 部門支援時數（讀 tasks.ownership 加總）
export async function fetchOwnershipSplit(): Promise<{
  core: number
  dept: number
}> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tasks')
    .select('ownership, actual_hours')
  if (error) throw error
  let core = 0
  let dept = 0
  ;(data ?? []).forEach((t) => {
    if (t.ownership === 'dept') dept += t.actual_hours || 0
    else core += t.actual_hours || 0
  })
  return { core, dept }
}

// 關注事項彙整:延遲/卡點/未啟動
export async function fetchAttention(): Promise<{
  pending: number
  blockers: number
}> {
  const supabase = createClient()
  const [{ data: projs }, { data: blockers }] = await Promise.all([
    supabase.from('projects').select('status'),
    supabase.from('project_blockers').select('id'),
  ])
  const pending = (projs ?? []).filter((p) => p.status === 'pending').length
  return { pending, blockers: (blockers ?? []).length }
}

export async function fetchProjectsForAlign(): Promise<{
  projects: ProjectRow[]
  progress: Record<string, ProjectProgressRow>
}> {
  const supabase = createClient()
  const [{ data: projs }, { data: prog }] = await Promise.all([
    supabase.from('projects').select('id, name, status, is_core').order('sort_order'),
    supabase.from('project_progress').select('*'),
  ])
  const progress: Record<string, ProjectProgressRow> = {}
  ;(prog ?? []).forEach((p) => (progress[p.project_id] = p as ProjectProgressRow))
  return { projects: (projs ?? []) as ProjectRow[], progress }
}

// 拖曳更新優先序 + 組內順序（樂觀鎖，同記錄頁規格）
// 回傳 'ok' | 'conflict'
export async function updatePriorityOCC(
  taskId: string,
  knownVersion: number,
  priority: string,
  sortOrder: number
): Promise<'ok' | 'conflict'> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tasks')
    .update({ priority, sort_order: sortOrder, version: knownVersion + 1 })
    .eq('id', taskId)
    .eq('version', knownVersion)
    .select()
  if (error) throw error
  if (!data || data.length === 0) return 'conflict'
  return 'ok'
}

// 組內精確插入：把被拖的 task 放到目標組的指定 index，
// 重排該組所有項目的 sort_order（0,1,2...）。
// 被拖的那張用樂觀鎖檢查 version；其餘只是重排序號。
// 回傳 'ok' | 'conflict'
// [你的決定:組內精確插入,拖到兩張卡之間]
export async function reorderWithinPriority(
  movedId: string,
  movedVersion: number,
  targetPriority: string,
  orderedIds: string[] // 該組期望的最終順序（含 movedId）
): Promise<'ok' | 'conflict'> {
  const supabase = createClient()
  // 先用樂觀鎖更新被拖的那張（改組 + 給它新序號 + version+1）
  const movedIndex = orderedIds.indexOf(movedId)
  const { data, error } = await supabase
    .from('tasks')
    .update({
      priority: targetPriority,
      sort_order: movedIndex,
      version: movedVersion + 1,
    })
    .eq('id', movedId)
    .eq('version', movedVersion)
    .select()
  if (error) throw error
  if (!data || data.length === 0) return 'conflict'

  // 其餘項目只重排 sort_order（不碰 version，純位置調整）
  const others = orderedIds.filter((id) => id !== movedId)
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i]
    if (id === movedId) continue
    await supabase.from('tasks').update({ sort_order: i }).eq('id', id)
  }
  void others
  return 'ok'
}

// 訂閱 tasks 變更（Realtime，同記錄頁）
export function subscribeAlign(onChange: () => void): () => void {
  const supabase = createClient()
  const channel = supabase
    .channel('align-tasks-changes')
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
