import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "TelopShot",
  description: "動画の見どころを自動抽出して、テロップ付きのスクリーンショットをプロジェクト保存・ダウンロードできるツール",
  icons: {
    icon: "/logomark.svg",
    shortcut: "/logomark.svg",
    apple: "/logomark.svg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
