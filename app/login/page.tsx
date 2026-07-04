'use client'

// 登入頁（單人用）：Email + 密碼登入，不寄驗證信。
// signInWithPassword 為 Supabase Auth 標準 API。
// [記憶,未查證:Supabase Auth 提供 signInWithPassword,未於本次查證官方當前簽名]
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      // 登入成功，導向反思頁（proxy 會確認 session）
      router.push('/reflect')
      router.refresh()
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#ECE7D1] p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-[#3a3527]">Alignment OS</h1>
        <p className="mt-1 text-sm text-[#a39c84]">登入以編輯你的工作日誌</p>

        <div className="mt-6 space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="你的 Email"
            className="w-full rounded-lg border border-[#ddd6c0] px-3 py-2 text-sm outline-none focus:border-[#8E977D]"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密碼"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && email && password) handleLogin()
            }}
            className="w-full rounded-lg border border-[#ddd6c0] px-3 py-2 text-sm outline-none focus:border-[#8E977D]"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            onClick={handleLogin}
            disabled={loading || !email || !password}
            className="w-full rounded-lg bg-[#8E977D] py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? '登入中…' : '登入'}
          </button>
        </div>
      </div>
    </main>
  )
}
