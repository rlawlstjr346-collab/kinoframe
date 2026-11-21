import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KINOFRAME — 35mm 빈티지 광고·뉴스·보도사진 구도 & 3초 설득 아카이브",
  description:
    "빈티지 TVCF, 역사적 뉴스릴, 지면 광고, 보도사진의 1점 투시·시선 동선·초반 3초 설득 공식을 뷰파인더 오버레이와 4컷 콘택트 시트로 해부하는 무서버 레퍼런스 아카이브.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="bg-darkroom-base font-sans text-ivory antialiased selection:bg-amber-kodak/30 selection:text-ivory">
        <div className="film-grain-overlay" aria-hidden="true" />
        <div className="darkroom-vignette" aria-hidden="true" />
        <div className="relative z-10 min-h-screen">{children}</div>
      </body>
    </html>
  );
}
