// OKR 頁資料存取
// 對應 schema-stage234.sql 的 okrs / key_results / key_result_projects
// 與 okr_progress / kr_progress view。
// KR↔專案多對多、進度取平均，皆為先前定案。
import { createClient } from '@/utils/supabase/client'

export type Objective = {
  id: string
  objective: string
  quarter: string
  sort_order: number
}

export type KeyResult = {
  id: string
  okr_id: string
  title: string
  sort_order: number
}

export type OkrProgress = {
  okr_id: string
  progress_pct: number
}

export type KrProgress = {
  kr_id: string
  okr_id: string
  progress_pct: number
}

export type ProjectLite = { id: string; name: string }

export async function fetchObjectives(): Promise<Objective[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('okrs')
    .select('*')
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as Objective[]
}

export async function fetchKeyResults(): Promise<KeyResult[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('key_results')
    .select('*')
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as KeyResult[]
}

export async function fetchOkrProgress(): Promise<OkrProgress[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('okr_progress').select('*')
  if (error) throw error
  return (data ?? []) as OkrProgress[]
}

export async function fetchKrProgress(): Promise<KrProgress[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('kr_progress').select('*')
  if (error) throw error
  return (data ?? []) as KrProgress[]
}

// KR 連的專案（多對多）：回傳 { kr_id: projectId[] }
export async function fetchKrProjects(): Promise<Record<string, string[]>> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('key_result_projects')
    .select('kr_id, project_id')
  if (error) throw error
  const map: Record<string, string[]> = {}
  ;(data ?? []).forEach((row) => {
    ;(map[row.kr_id] ??= []).push(row.project_id)
  })
  return map
}

export async function fetchProjectsLite(): Promise<ProjectLite[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('projects')
    .select('id, name')
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as ProjectLite[]
}

export async function createObjective(
  objective: string,
  quarter: string
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('okrs').insert({ objective, quarter })
  if (error) throw error
}

export async function updateObjective(
  id: string,
  patch: Partial<Objective>
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('okrs').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteObjective(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('okrs').delete().eq('id', id)
  if (error) throw error
}

export async function createKeyResult(
  okrId: string,
  title: string
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('key_results')
    .insert({ okr_id: okrId, title })
  if (error) throw error
}

export async function deleteKeyResult(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('key_results').delete().eq('id', id)
  if (error) throw error
}

// 設定 KR 連的專案（多對多）
// [debug loop 修正:原本「先全刪再插入」若 insert 失敗會清空連結。
//  改為先 upsert 新的、再刪除不在清單中的,避免中途出現全空狀態。]
export async function setKrProjects(
  krId: string,
  projectIds: string[]
): Promise<void> {
  const supabase = createClient()
  // 先補上要的（upsert 忽略已存在）
  if (projectIds.length > 0) {
    const rows = projectIds.map((pid) => ({ kr_id: krId, project_id: pid }))
    const { error: upErr } = await supabase
      .from('key_result_projects')
      .upsert(rows, { onConflict: 'kr_id,project_id' })
    if (upErr) throw upErr
  }
  // 再刪掉不在新清單中的
  let q = supabase.from('key_result_projects').delete().eq('kr_id', krId)
  if (projectIds.length > 0) {
    q = q.not('project_id', 'in', `(${projectIds.join(',')})`)
  }
  const { error: delErr } = await q
  if (delErr) throw delErr
}
