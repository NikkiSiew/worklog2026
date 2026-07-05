'use client'

// 反思能力樹頁（雙層保護：登入 by middleware + PIN by 本頁）
// 補齊：每個能力可新增快速筆記、勾選完成，兩者自動加 XP。
// [缺口修補:原本只顯示能力樹 XP,筆記/加分 lib 有但 UI 沒接]
import { useEffect, useState, useCallback } from 'react'
import {
  fetchSkills,
  fetchQuickNotes,
  addQuickNote,
  markNoteDone,
  SCORE,
  type Skill,
  type QuickNote,
} from '@/lib/reflect'

export default function ReflectPage() {
  const [unlocked, setUnlocked] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const [skills, setSkills] = useState<Skill[]>([])
  const [notes, setNotes] = useState<Record<string, QuickNote[]>>({})
  const [loadErr, setLoadErr] = useState<string | null>(null)

  async function submitPin() {
    setChecking(true)
    setError(null)
    try {
      const res = await fetch('/api/reflect-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      const data = await res.json()
      if (data.ok) setUnlocked(true)
      else setError(data.error ?? 'PIN 錯誤')
    } catch (e) {
      setError(String(e))
    }
    setChecking(false)
  }

  const load = useCallback(async () => {
    try {
      const sk = await fetchSkills()
      setSkills(sk)
      // 抓每個 skill 的筆記
      const noteMap: Record<string, QuickNote[]> = {}
      await Promise.all(
        sk.map(async (s) => {
          noteMap[s.id] = await fetchQuickNotes(s.id)
        })
      )
      setNotes(noteMap)
    } catch (e) {
      setLoadErr(String(e))
    }
  }, [])

  useEffect(() => {
    if (!unlocked) return
    load()
  }, [unlocked, load])

  if (!unlocked) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#ECE7D1] p-6">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
          <h1 className="text-lg font-semibold text-[#3a3527]">反思 · 能力樹</h1>
          <p className="mt-1 text-sm text-[#a39c84]">這是你的小天地，輸入 PIN 進入</p>
          <div className="mt-6 space-y-3">
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN"
              onKeyDown={(e) => e.key === 'Enter' && pin && submitPin()}
              className="w-full rounded-lg border border-[#ddd6c0] px-3 py-2 text-sm outline-none focus:border-[#8E977D]"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              onClick={submitPin}
              disabled={checking || !pin}
              className="w-full rounded-lg bg-[#8E977D] py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {checking ? '驗證中…' : '解鎖'}
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#ECE7D1] p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-xl font-semibold text-[#3a3527]">反思 · 能力樹</h1>
        <p className="mt-1 text-sm text-[#a39c84]">
          記錄想法 +{SCORE.record}、打勾完成 +{SCORE.check} XP
        </p>
        {loadErr && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            讀取失敗：{loadErr}
            <p className="mt-1 text-xs text-red-500">
              若為連線錯誤，請確認 Supabase 已設定且 schema 已執行。
            </p>
          </div>
        )}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {skills.map((s) => (
            <SkillCard
              key={s.id}
              skill={s}
              notes={notes[s.id] ?? []}
              onChanged={load}
              onError={setLoadErr}
            />
          ))}
          {skills.length === 0 && !loadErr && (
            <p className="text-sm text-[#a39c84]">尚無能力樹資料。</p>
          )}
        </div>
      </div>
    </main>
  )
}

function SkillCard({
  skill,
  notes,
  onChanged,
  onError,
}: {
  skill: Skill
  notes: QuickNote[]
  onChanged: () => void
  onError: (e: string) => void
}) {
  const [newNote, setNewNote] = useState('')
  const todos = notes.filter((n) => n.status === 'todo')
  const dones = notes.filter((n) => n.status === 'done')

  async function add() {
    if (!newNote.trim()) return
    try {
      await addQuickNote(skill.id, newNote.trim())
      setNewNote('')
      onChanged()
    } catch (e) {
      onError(String(e))
    }
  }

  async function done(note: QuickNote) {
    try {
      await markNoteDone(note.id, skill.id)
      onChanged()
    } catch (e) {
      onError(String(e))
    }
  }

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-[#3a3527]">{skill.name}</h2>
        <span className="font-mono text-sm text-[#8E977D]">{skill.xp} XP</span>
      </div>
      {skill.short_motto && (
        <p className="mt-1 text-xs text-[#a39c84]">{skill.short_motto}</p>
      )}

      {skill.insights?.length > 0 && (
        <ul className="mt-3 space-y-1">
          {skill.insights.map((ins, i) => (
            <li key={i} className="text-xs text-[#3a3527]">
              · {ins}
            </li>
          ))}
        </ul>
      )}

      {/* 快速筆記 */}
      <div className="mt-4 border-t border-[#eee6cf] pt-3">
        <div className="flex gap-2">
          <input
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="記一個想法…"
            onKeyDown={(e) => e.key === 'Enter' && add()}
            className="flex-1 rounded-lg border border-[#ddd6c0] px-2 py-1.5 text-xs outline-none focus:border-[#8E977D]"
          />
          <button
            onClick={add}
            className="rounded-lg bg-[#8E977D] px-3 py-1.5 text-xs text-white"
          >
            記錄
          </button>
        </div>

        {/* 待完成 */}
        {todos.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {todos.map((n) => (
              <div key={n.id} className="flex items-start gap-2 text-xs">
                <button
                  onClick={() => done(n)}
                  className="mt-0.5 shrink-0 rounded border border-[#8E977D] px-1 text-[#8E977D] hover:bg-[#8E977D] hover:text-white"
                  title={`打勾完成 +${SCORE.check} XP`}
                >
                  ☐
                </button>
                <span className="text-[#3a3527]">{n.content}</span>
              </div>
            ))}
          </div>
        )}

        {/* 已完成 */}
        {dones.length > 0 && (
          <div className="mt-2 space-y-1">
            {dones.map((n) => (
              <div key={n.id} className="flex items-start gap-2 text-xs text-[#a39c84]">
                <span className="mt-0.5 shrink-0">☑</span>
                <span className="line-through">{n.content}</span>
              </div>
            ))}
          </div>
        )}

        {notes.length === 0 && (
          <p className="mt-2 text-xs text-[#c2bba8]">還沒有筆記。</p>
        )}
      </div>
    </div>
  )
}
