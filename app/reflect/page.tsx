'use client'

// 反思能力樹頁（雙層保護：登入 by middleware + PIN by 本頁）
// PIN 通過後存 token 於記憶體 state（非 localStorage，符合單頁 session）。
import { useEffect, useState } from 'react'
import { fetchSkills, type Skill } from '@/lib/reflect'

export default function ReflectPage() {
  const [unlocked, setUnlocked] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const [skills, setSkills] = useState<Skill[]>([])
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

  useEffect(() => {
    if (!unlocked) return
    fetchSkills()
      .then(setSkills)
      .catch((e) => setLoadErr(String(e)))
  }, [unlocked])

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
        {loadErr && (
          <p className="mt-4 text-sm text-red-600">讀取失敗：{loadErr}</p>
        )}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {skills.map((s) => (
            <div key={s.id} className="rounded-xl bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-medium text-[#3a3527]">{s.name}</h2>
                <span className="text-sm font-mono text-[#8E977D]">
                  {s.xp} XP
                </span>
              </div>
              {s.short_motto && (
                <p className="mt-1 text-xs text-[#a39c84]">{s.short_motto}</p>
              )}
              {s.insights?.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {s.insights.map((ins, i) => (
                    <li key={i} className="text-xs text-[#3a3527]">
                      · {ins}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {skills.length === 0 && !loadErr && (
            <p className="text-sm text-[#a39c84]">尚無能力樹資料。</p>
          )}
        </div>
      </div>
    </main>
  )
}
