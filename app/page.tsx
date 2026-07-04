import { redirect } from 'next/navigation'

// 首頁導向反思頁（未登入時 middleware 會再導向 /login）
export default function Home() {
  redirect('/reflect')
}
