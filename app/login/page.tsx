'use client'

// 登入頁（單人用）：以 Email Magic Link 登入，免管理密碼。
// signInWithOtp 為 Supabase Auth 標準 API。
// [已查證:Supabase Auth SDK 提供 email OTP/magic link 登入,
//  supabase.com/docs/guides/auth/server-side/nextjs]
import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          typeof window !== 'undefined'
            ? `${window.location.origin}/auth/callback`
            : undefined,
      },
    })
    setLoading(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#ECE7D1] p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-[#3a3527]">Alignment OS</h1>
        <p className="mt-1 text-sm text-[#a39c84]">登入以編輯你的工作日誌</p>

        {sent ? (
          <p className="mt-6 text-sm text-[#3a3527]">
            登入連結已寄到 {email}，請至信箱點擊連結完成登入。
          </p>
        ) : (
          <div className="mt-6 space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="你的 Email"
              className="w-full rounded-lg border border-[#ddd6c0] px-3 py-2 text-sm outline-none focus:border-[#8E977D]"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              onClick={handleLogin}
              disabled={loading || !email}
              className="w-full rounded-lg bg-[#8E977D] py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? '寄送中…' : '寄送登入連結'}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
