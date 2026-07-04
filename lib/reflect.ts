// 反思能力樹的資料存取與計分邏輯
// 計分規則 [記憶,未查證:來自上線規劃書，未逐行核對原型 JS]：
//   記錄 +1、打勾 +2、領悟 +3、實踐 +5
import { createClient } from '@/utils/supabase/client'

export type Skill = {
  id: string
  name: string
  short_motto: string | null
  full_motto: string | null
  xp: number
  insights: string[]
  updated_at: string
}

export type QuickNote = {
  id: string
  skill_id: string
  content: string
  status: 'todo' | 'done'
  created_at: string
  done_at: string | null
}

export const SCORE = {
  record: 1, // 記錄
  check: 2, // 打勾
  insight: 3, // 領悟
  practice: 5, // 實踐
} as const

export async function fetchSkills(): Promise<Skill[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('skills')
    .select('*')
    .order('id')
  if (error) throw error
  return (data ?? []) as Skill[]
}

// 保留策略：已完成只取 2 週內（查詢層過濾，不刪資料）
// [已查證:保留策略定義見上線規劃書 v2 與 schema.sql]
export async function fetchQuickNotes(skillId: string): Promise<QuickNote[]> {
  const supabase = createClient()
  const twoWeeksAgo = new Date(
    Date.now() - 14 * 24 * 3600 * 1000
  ).toISOString()
  const { data, error } = await supabase
    .from('quick_notes')
    .select('*')
    .eq('skill_id', skillId)
    .or(`status.eq.todo,done_at.gte.${twoWeeksAgo}`)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as QuickNote[]
}

export async function addQuickNote(skillId: string, content: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('quick_notes')
    .insert({ skill_id: skillId, content, status: 'todo' })
  if (error) throw error
  // 記錄 +1
  await bumpXp(skillId, SCORE.record)
}

export async function markNoteDone(noteId: string, skillId: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('quick_notes')
    .update({ status: 'done', done_at: new Date().toISOString() })
    .eq('id', noteId)
  if (error) throw error
  // 打勾 +2
  await bumpXp(skillId, SCORE.check)
}

async function bumpXp(skillId: string, delta: number) {
  const supabase = createClient()
  // 用資料庫端原子遞增,避免「讀後寫」競態（快速連續操作會少算）。
  // [debug loop 修正:原本 select 再 update 有 race condition]
  const { error } = await supabase.rpc('increment_skill_xp', {
    p_skill_id: skillId,
    p_delta: delta,
  })
  if (error) throw error
}
