import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KINOFRAME — Optical Cinema & Vintage TVCF Reference Archive",
  description:
    "광학·촬영·조명·편집 기법 트리와 빈티지 시네마·TVCF 무빙 클립을 실시간 수맥으로 탐색하는 디렉터용 비주얼 레퍼런스 아카이브.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css"
        />
      </head>
      <body className="bg-[#0A0B0E] text-[#F2EFE9] antialiased selection:bg-[#C89E52]/35 selection:text-[#F2EFE9]">
        <div className="relative z-10 min-h-screen bg-[#0A0B0E]">{children}</div>
      </body>
    </html>
  );
}
