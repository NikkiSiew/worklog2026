// Session 刷新 middleware 邏輯
// 依官方：supabase.com/docs/guides/auth/server-side/nextjs [已查證]
// Server Components 不能寫 cookie，故由 middleware 在每次請求刷新過期的 auth token。
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 重要：getUser() 會驗證 token；勿在此與 createServerClient 之間插入其他邏輯。
  // [已查證:supabase.com/docs/guides/auth/server-side/nextjs]
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 未登入者導向 /login（/login、/report 唯讀分享、靜態資源除外）
  const path = request.nextUrl.pathname
  const isPublic =
    path.startsWith('/login') ||
    path.startsWith('/report') || // 主管唯讀分享連結，不需登入
    path.startsWith('/auth')
  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
