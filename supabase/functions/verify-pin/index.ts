// PIN 驗證 Edge Function（反思頁後端真驗證）
// 寫法依官方 Deno.serve 模式 [已查證:supabase.com/docs/guides/functions；
//   blog.starmorph.com 2026 v2 handler pattern]
//
// 流程：前端送 PIN → 後端比對 reflect_auth.pin_hash → 對了回傳短期 token。
// PIN 沒過，反思資料不會離開伺服器。
//
// 環境變數 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 由平台自動注入。
// [已查證:supabase.com/docs/guides/functions/secrets]
// 額外需自設：REFLECT_SESSION_SECRET（簽 token 用），用 supabase secrets set 設定。

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// 用 Web Crypto API 算 SHA-256（Deno 原生支援，Web 標準）
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// 簽一個帶到期時間的簡單 token（HMAC）。非 JWT，夠用於單人反思頁。
async function signToken(secret: string, expEpoch: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const payload = `reflect.${expEpoch}`
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload)
  )
  const sigHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `${expEpoch}.${sigHex}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: cors })
  }

  try {
    const { pin } = await req.json()
    if (!pin || typeof pin !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'PIN required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! // 繞過 RLS 讀 pin_hash
    )

    const { data, error } = await supabase
      .from('reflect_auth')
      .select('pin_hash')
      .eq('id', 1)
      .single()

    if (error || !data) {
      return new Response(
        JSON.stringify({ ok: false, error: 'PIN not configured' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    const inputHash = await sha256Hex(pin)
    if (inputHash !== data.pin_hash) {
      return new Response(JSON.stringify({ ok: false, error: 'Wrong PIN' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // 通過：發 8 小時有效的 token
    const exp = Math.floor(Date.now() / 1000) + 8 * 3600
    const token = await signToken(
      Deno.env.get('REFLECT_SESSION_SECRET') ?? 'change-me',
      exp
    )

    return new Response(JSON.stringify({ ok: true, token, exp }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
