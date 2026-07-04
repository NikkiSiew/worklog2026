// 唯讀分享 Edge Function（給主管/同事看其他頁，不需登入）
// 寫法依官方 Deno.serve 模式 [已查證:supabase.com/docs/guides/functions]
//
// 安全設計（v2 修正核心）：
// - 主管的瀏覽器「不直連資料庫」，而是打這支函式。
// - 函式用 SERVICE_ROLE_KEY 在後端讀（繞過 RLS），只回傳該 token scope 允許的頁。
// - 反思相關表（skills / quick_notes / reflect_auth）此函式「完全不查」，
//   因此主管連被誤讀的路徑都沒有。
// [已查證:service role key 一律 bypass RLS 且僅限後端,
//  supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data]

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

// scope 與「可讀資料表」的白名單對照。
// 反思相關表「刻意不在此白名單內」，無論 token 怎麼帶都讀不到。
// 目前只支援 weekly 分享（週報唯讀連結）。
// [輪2 debug:移除 okr/align scope—alignments 表不存在,
//  且它們走「撈整張表」的舊邏輯會洩漏所有資料,與週報的
//  「只回傳該 token 對應快照」安全模式不一致。日後要分享其他頁時,
//  須比照 weekly 做 token 對應過濾,不可撈整張表。]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('token')
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: 'token required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1) 驗證 token：查 share_links，並檢查是否過期
    const { data: link, error: linkErr } = await supabase
      .from('share_links')
      .select('token, scope, expires_at')
      .eq('token', token)
      .single()

    if (linkErr || !link) {
      return new Response(JSON.stringify({ ok: false, error: 'invalid token' }), {
        status: 404,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return new Response(JSON.stringify({ ok: false, error: 'link expired' }), {
        status: 410,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // 2) 依 scope 回傳資料（唯讀）
    let result: Record<string, unknown> = {}
    if (link.scope === 'weekly') {
      // 週報:只回傳「這個 token 對應的那筆週報快照」,
      // 不撈整張表(避免洩漏其他週報)。
      // share_token 與 share_links.token 一致。
      const { data: report } = await supabase
        .from('weekly_reports')
        .select('week_start, week_end, published_at, snapshot')
        .eq('share_token', token)
        .eq('is_published', true)
        .single()
      result = { weekly: report ?? null }
    } else {
      // 目前只支援 weekly 分享。其他 scope 一律拒絕,
      // 避免「撈整張表」洩漏。日後要支援須比照 weekly 做 token 過濾。
      return new Response(
        JSON.stringify({ ok: false, error: 'unsupported scope' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ ok: true, scope: link.scope, data: result }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
