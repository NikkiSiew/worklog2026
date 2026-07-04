import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

// Next.js 16：middleware 已改名為 proxy（函式名與檔名都改）。
// [已查證:nextjs.org/docs/app/guides/upgrading/version-16]
// 邏輯不變：刷新 session + 未登入導向 /login（/report 等公開路由除外）。
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
