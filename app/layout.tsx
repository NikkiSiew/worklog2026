import type { Metadata } from "next";
import "./globals.css";
import Nav from "./Nav";

// 字型用系統字型堆疊，不依賴 next/font/google。
// 原因：避免綁定外部字型抓取；你若要用 Geist，部署環境能連 Google Fonts 時可改回。
export const metadata: Metadata = {
  title: "Alignment OS",
  description: "工作日誌 · 對齊 · 反思",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant" className="h-full antialiased">
      <body
        className="min-h-full flex flex-col"
        style={{
          fontFamily:
            '-apple-system, "Helvetica Neue", "Noto Sans TC", sans-serif',
        }}
      >
        <Nav />
        {children}
      </body>
    </html>
  );
}
