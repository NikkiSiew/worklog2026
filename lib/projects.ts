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
