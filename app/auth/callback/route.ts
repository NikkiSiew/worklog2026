// Auth callback：magic link 點擊後回到這裡，交換 code 為 session。
// [已查證:SSR 環境需 server endpoint 交換 token_hash/code 為 session,
//  supabase.com/docs/guides/getting-started/tutorials/with-nextjs]
import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/reflect'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
