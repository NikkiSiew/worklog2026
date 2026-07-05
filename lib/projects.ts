// 專案頁資料存取
// 對應 schema-stage234.sql 的 projects / project_phases / tasks /
// project_blockers 與 project_progress / phase_progress view。
import { createClient } from '@/utils/supabase/client'

export type Project = {
  id: string
  name: string
  status: string
  owner: string | null
  due_date: string | null
  is_core: boolean
  start_date: string | null
  est_complete_date: string | null
  sort_order: number
}

export type Phase = {
  id: string
  project_id: string
  name: string
  seq: number
  is_current: boolean
}

export type Task = {
  id: string
  project_id: string
  phase_id: string | null
  name: string
  leverage: string | null
  priority: string | null
  planned_hours: number | null
  actual_hours: number
  status: string
  is_done: boolean
}

export type Blocker = {
  id: string
  project_id: string
  task_name: string | null
  severity: string | null
  reason: string | null
  countermeasure: string | null
  manager_note: string | null
}

export type ProjectProgress = {
  project_id: string
  done_tasks: number
  total_tasks: number
  progress_pct: number
  logged_hours: number
}

export async function fetchProjects(): Promise<Project[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as Project[]
}

export async function fetchProjectProgress(): Promise<ProjectProgress[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('project_progress').select('*')
  if (error) throw error
  return (data ?? []) as ProjectProgress[]
}

export async function fetchPhases(projectId: string): Promise<Phase[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('project_phases')
    .select('*')
    .eq('project_id', projectId)
    .order('seq')
  if (error) throw error
  return (data ?? []) as Phase[]
}

export async function fetchTasks(projectId: string): Promise<Task[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', projectId)
  if (error) throw error
  return (data ?? []) as Task[]
}

export async function fetchBlockers(projectId: string): Promise<Blocker[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('project_blockers')
    .select('*')
    .eq('project_id', projectId)
  if (error) throw error
  return (data ?? []) as Blocker[]
}

export async function createProject(name: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('projects').insert({ name })
  if (error) throw error
}

export async function updateProject(
  id: string,
  patch: Partial<Project>
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('projects').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteProject(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw error
}

// ===== 階段（Phase）CRUD =====
// [缺口修補:原本專案頁只顯示階段,無法新增/編輯/刪除]
export async function createPhase(
  projectId: string,
  name: string,
  seq: number
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('project_phases')
    .insert({ project_id: projectId, name, seq })
  if (error) throw error
}

export async function updatePhase(
  id: string,
  patch: Partial<Phase>
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('project_phases')
    .update(patch)
    .eq('id', id)
  if (error) throw error
}

export async function deletePhase(id: string): Promise<void> {
  const supabase = createClient()
  // 先把該階段的 task 解除 phase 關聯（避免外鍵孤兒），再刪階段
  await supabase.from('tasks').update({ phase_id: null }).eq('phase_id', id)
  const { error } = await supabase.from('project_phases').delete().eq('id', id)
  if (error) throw error
}

// ===== 卡點（Blocker）CRUD =====
// [缺口修補:原本專案頁只顯示卡點,無法新增/編輯/刪除]
export async function createBlocker(
  projectId: string,
  blocker: Partial<Blocker>
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('project_blockers')
    .insert({ project_id: projectId, ...blocker })
  if (error) throw error
}

export async function updateBlocker(
  id: string,
  patch: Partial<Blocker>
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('project_blockers')
    .update(patch)
    .eq('id', id)
  if (error) throw error
}

export async function deleteBlocker(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('project_blockers')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// 新增 task 到某專案/階段（專案頁直接建工作項用）
export async function createProjectTask(
  projectId: string,
  phaseId: string | null,
  name: string
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('tasks')
    .insert({ project_id: projectId, phase_id: phaseId, name })
  if (error) throw error
}
