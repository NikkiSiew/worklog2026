'use client'

// 共用導覽列。登入後的主要頁面共用。
// 排除 /login 與 /report/[token]（唯讀分享不該有導覽,主管不該看到其他頁入口）。
// [已查證:你的決定—分享連結無導覽列、無法跳其他頁]
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/align', label: '對齊' },
  { href: '/okr', label: 'OKR' },
  { href: '/record', label: '記錄' },
  { href: '/projects', label: '專案' },
  { href: '/weekly', label: '週報' },
  { href: '/reflect', label: '反思' },
  { href: '/recurring', label: '固定排程' },
]

export default function Nav() {
  const pathname = usePathname()

  // 不顯示導覽的路徑
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/report') ||
    pathname.startsWith('/auth')
  ) {
    return null
  }

  return (
    <nav
      className="sticky top-0 z-10 border-b backdrop-blur"
      style={{ borderColor: 'var(--lemon)', background: 'rgba(236,231,209,0.85)' }}
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-1 px-4 py-2">
        <span className="mr-3 text-sm font-semibold" style={{ color: 'var(--green-deep)' }}>
          Alignment OS
        </span>
        {NAV.map((item) => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3 py-1 text-sm transition-colors"
              style={{
                background: active ? 'var(--green)' : 'transparent',
                color: active ? '#fff' : 'var(--ink-soft)',
              }}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
