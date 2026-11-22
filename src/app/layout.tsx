import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KINOFRAME — Visual Technique & Moving Film Archive",
  description:
    "시네마틱 촬영 기법·빈티지 TVCF·고전 영화·시대 거리·인터넷 망령 무빙 클립을 실시간 수맥으로 탐색하는 비주얼 레퍼런스 아카이브.",
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
      <body className="bg-black text-white antialiased selection:bg-[#fc087d]/35 selection:text-white">
        <div className="relative z-10 min-h-screen bg-black">{children}</div>
      </body>
    </html>
  );
}
