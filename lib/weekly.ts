// 週報頁資料存取
// 設計:平時即時、發布時凍結快照（你的決定）。
// 草稿手寫敘述即時存 draft;發布時把 draft + 當下彙整凍結進 snapshot。
import { createClient } from '@/utils/supabase/client'

export type WeeklyDraft = {
  // 需要主管的 3 件事
  decisions: string // 待裁示
  proposals: string // 提案
  notices: string // 知會
  // 核心戰果的產出價值（自由文字,可多段）
  achievements: string
  // 系統耗損與流程診斷
  diagnosis: string
}

export type WeeklyReport = {
  id: string
  week_start: string
  week_end: string
  is_published: boolean
  published_at: string | null
  share_token: string | null
  draft: WeeklyDraft
  snapshot: Record<string, unknown> | null
}

const emptyDraft: WeeklyDraft = {
  decisions: '',
  proposals: '',
  notices: '',
  achievements: '',
  diagnosis: '',
}

// 取某週起訖的週報;沒有就建一筆草稿
export async function getOrCreateWeekly(
  weekStart: string,
  weekEnd: string
): Promise<WeeklyReport> {
  const supabase = createClient()
  const { data: existing, error } = await supabase
    .from('weekly_reports')
    .select('*')
    .eq('week_start', weekStart)
    .limit(1)
  if (error) throw error
  if (existing && existing.length) {
    const r = existing[0]
    return { ...r, draft: { ...emptyDraft, ...(r.draft ?? {}) } } as WeeklyReport
  }
  const { data: created, error: insErr } = await supabase
    .from('weekly_reports')
    .insert({ week_start: weekStart, week_end: weekEnd, draft: emptyDraft })
    .select()
    .single()
  if (insErr) throw insErr
  return { ...created, draft: emptyDraft } as WeeklyReport
}

// 即時存草稿（你的決定:草稿也存,隨時續寫）
export async function saveDraft(
  reportId: string,
  draft: WeeklyDraft
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('weekly_reports')
    .update({ draft })
    .eq('id', reportId)
  if (error) throw error
}

// 彙整某週的數字（即時算,讀 tasks）
export async function summarizeWeek(
  weekStart: string,
  weekEnd: string
): Promise<{
  totalHours: number
  corePct: number
  deptPct: number
  leverage: { key: string; hours: number; pct: number }[]
}> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tasks')
    .select('actual_hours, ownership, leverage, scheduled_date')
    .gte('scheduled_date', weekStart)
    .lte('scheduled_date', weekEnd)
  if (error) throw error
  const tasks = data ?? []
  const totalHours = tasks.reduce((s, t) => s + (t.actual_hours || 0), 0)
  const core = tasks
    .filter((t) => t.ownership !== 'dept')
    .reduce((s, t) => s + (t.actual_hours || 0), 0)
  const dept = totalHours - core
  const levMap: Record<string, number> = {}
  tasks.forEach((t) => {
    if (t.leverage) levMap[t.leverage] = (levMap[t.leverage] || 0) + (t.actual_hours || 0)
  })
  const order = ['strategic', 'operational', 'systematic', 'exploration']
  const leverage = order
    .filter((k) => levMap[k])
    .map((k) => ({
      key: k,
      hours: levMap[k],
      pct: totalHours > 0 ? Math.round((levMap[k] / totalHours) * 100) : 0,
    }))
  return {
    totalHours,
    corePct: totalHours > 0 ? Math.round((core / totalHours) * 100) : 0,
    deptPct: totalHours > 0 ? Math.round((dept / totalHours) * 100) : 0,
    leverage,
  }
}

// 下週佈局：讀對齊頁的 P1/P2（你的決定:即時同步,不另存）
export async function fetchNextWeekPriorities(): Promise<
  { id: string; name: string; priority: string; leverage: string | null }[]
> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tasks')
    .select('id, name, priority, leverage')
    .in('priority', ['P1', 'P2'])
    .order('priority')
  if (error) throw error
  return (data ?? []) as {
    id: string
    name: string
    priority: string
    leverage: string | null
  }[]
}

// 發布：把 draft + 當下彙整凍結進 snapshot,產生 share_token
export async function publishWeekly(
  report: WeeklyReport,
  summary: Record<string, unknown>,
  nextWeek: unknown[]
): Promise<string> {
  const supabase = createClient()
  // 產生不可猜的 token
  const token =
    crypto.randomUUID().replace(/-/g, '') +
    crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  const snapshot = {
    draft: report.draft,
    summary,
    nextWeek,
    frozen_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('weekly_reports')
    .update({
      is_published: true,
      published_at: new Date().toISOString(),
      share_token: token,
      snapshot,
    })
    .eq('id', report.id)
  if (error) throw error

  // 同步寫一筆 share_links 給 read-share Edge Function 用
  await supabase
    .from('share_links')
    .insert({ token, scope: 'weekly' })
    .select()
  return token
}
