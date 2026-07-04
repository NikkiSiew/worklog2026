// 前端 PIN 驗證入口：轉發到 Supabase Edge Function verify-pin。
// 為什麼經由這個 route 而非前端直打 Edge Function：
//   集中管理、可加登入檢查（只有登入者能嘗試 PIN）。
import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  // 先確認已登入（反思頁的雙層第一層）
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: '未登入' }, { status: 401 })
  }

  const { pin } = await request.json()
  const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/verify-pin`

  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // 呼叫 Edge Function 需帶 anon/publishable key 當 apikey
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
    },
    body: JSON.stringify({ pin }),
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
