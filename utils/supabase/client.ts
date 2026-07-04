// 瀏覽器端 Supabase client（用於 Client Components）
// 寫法依官方文件：supabase.com/docs/guides/auth/server-side/creating-a-client [已查證]
//
// 金鑰命名說明：
// - 官方自 2026 起改用 publishable key（sb_publishable_xxx），舊的 anon key 將於 2026 年底淘汰
//   [已查證:supabase.com/docs/guides/auth/server-side/creating-a-client]
// - 這裡的環境變數名沿用 NEXT_PUBLIC_SUPABASE_ANON_KEY 以相容你後台可能拿到的任一種；
//   新專案建議填 publishable key，舊專案填 anon key，兩者都可放這個變數。
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
