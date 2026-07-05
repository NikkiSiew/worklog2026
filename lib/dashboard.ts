// Dashboard 資料存取（四象限彙整）
// 象限1 本週核心任務(P1/P2,可勾選) / 象限2 OKR推進 / 象限3 KPI / 象限4 風險
// KPI 紅線跌破:讀取時即時判斷併入風險(你的決定,不寫表)。
import { createClient } from '@/utils/supabase/client'

export type DashTask = {
  id: string
  name: string
  project_id: string | null
  priority: string | null
  scheduled_date: string | null
  is_done: boolean
  version: number
}

export type DashObjective = {
  id: string
  objective: string
  quarter: string
}
export type DashKR = { id: string; okr_id: string; title: string }

export type Kpi = {
  id: string
  name: string
  current_value: number | null
  target_value: number | null
  redline_value: number | null
  direction: string // higher / lower
  unit: string | null
  review_frequency: string
  source: string
  trend: string | null
  screenshot_url: string | null
  sort_order: number
}

export type Risk = {
  id: string
  description: string
  source: string // auto / manual
  related_project_id: string | null
}

// 象限1：P1/P2 task（Dashboard 只顯示 P1 & P2）
// [已查證:原型「Dashboard 只顯示 P1 & P2」]
export async function fetchCoreTasks(): Promise<DashTask[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tasks')
    .select('id, name, project_id, priority, scheduled_date, is_done, version')
    .in('priority', ['P1', 'P2'])
    .order('priority')
  if (error) throw error
  return (data ?? []) as DashTask[]
}

export async function toggleTaskDone(
  taskId: string,
  done: boolean
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('tasks')
    .update({ is_done: done })
    .eq('id', taskId)
  if (error) throw error
}

// 象限2：OKR + KR + 進度
export async function fetchOkrSummary(): Promise<{
  objectives: DashObjective[]
  krs: DashKR[]
  okrPct: Record<string, number>
  krPct: Record<string, number>
}> {
  const supabase = createClient()
  const [{ data: objs }, { data: krs }, { data: op }, { data: kp }] =
    await Promise.all([
      supabase.from('okrs').select('id, objective, quarter').order('sort_order'),
      supabase.from('key_results').select('id, okr_id, title').order('sort_order'),
      supabase.from('okr_progress').select('*'),
      supabase.from('kr_progress').select('*'),
    ])
  const okrPct: Record<string, number> = {}
  ;(op ?? []).forEach((r) => (okrPct[r.okr_id] = r.progress_pct))
  const krPct: Record<string, number> = {}
  ;(kp ?? []).forEach((r) => (krPct[r.kr_id] = r.progress_pct))
  return {
    objectives: (objs ?? []) as DashObjective[],
    krs: (krs ?? []) as DashKR[],
    okrPct,
    krPct,
  }
}

// 象限3：KPI 清單
export async function fetchKpis(): Promise<Kpi[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('kpis')
    .select('*')
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as Kpi[]
}

// KPI 是否跌破紅線（即時判斷）
// direction=higher:current < redline 為跌破;lower:current > redline 為跌破
// [你的決定:讀取時即時判斷]
export function isKpiBreached(k: Kpi): boolean {
  if (k.current_value == null || k.redline_value == null) return false
  return k.direction === 'lower'
    ? k.current_value > k.redline_value
    : k.current_value < k.redline_value
}

// 象限4：風險清單（手動存的） + KPI 跌破即時併入
export async function fetchRisks(): Promise<Risk[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('risks')
    .select('id, description, source, related_project_id')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Risk[]
}

export async function createRisk(description: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('risks')
    .insert({ description, source: 'manual' })
  if (error) throw error
}

export async function deleteRisk(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('risks').delete().eq('id', id)
  if (error) throw error
}

// KPI 管理 CRUD
export async function createKpi(kpi: Partial<Kpi> & { name: string }) {
  const supabase = createClient()
  const { error } = await supabase.from('kpis').insert(kpi)
  if (error) throw error
}
export async function deleteKpi(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('kpis').delete().eq('id', id)
  if (error) throw error
}
