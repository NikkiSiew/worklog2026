// 伺服器端 Supabase client（用於 Server Components / Server Actions / Route Handlers）
// 寫法依官方文件：supabase.com/docs/guides/auth/server-side/creating-a-client [已查證]
//
// 注意：Next.js 16 的 cookies() 為 async，必須 await。
// [已查證:本專案實測 Next 16.2.9；cookies() async 為 Next 15+ 行為]
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // 在 Server Component 內呼叫 setAll 會被忽略；
            // 有 middleware 負責刷新 session 時可安全略過。
            // [已查證:supabase.com/docs/guides/auth/server-side/nextjs]
          }
        },
      },
    }
  )
}

// 後端專用：用 secret key（service_role）建立的 client，會繞過 RLS。
// 只能在伺服器端使用，金鑰絕不可進前端。
// [已查證:service role/secret key 一律 bypass RLS 且不可暴露前端,
//  supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data]
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!, // 後台的 secret key（舊稱 service_role key）
    { auth: { persistSession: false } }
  )
}
