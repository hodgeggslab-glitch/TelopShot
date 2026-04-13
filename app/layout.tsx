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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=M+PLUS+1p:wght@400;700;900&family=M+PLUS+Rounded+1c:wght@400;700;900&family=Noto+Sans+JP:wght@400;700;900&family=Noto+Serif+JP:wght@400;700;900&family=Zen+Kaku+Gothic+New:wght@400;700;900&family=Zen+Old+Mincho:wght@400;700;900&family=Zen+Maru+Gothic:wght@400;700;900&family=Kosugi+Maru&family=Sawarabi+Gothic&family=Sawarabi+Mincho&family=Klee+One:wght@400;600&family=Reggae+One&family=RocknRoll+One&family=Hachi+Maru+Pop&family=Yusei+Magic&family=Dela+Gothic+One&family=Train+One&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
