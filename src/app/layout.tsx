import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = "https://kinoframe.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "KINOFRAME — 광고·영화 영상 연출 레퍼런스 무빙 아카이브",
    template: "%s | KINOFRAME",
  },
  description:
    "광고 레퍼런스 사이트 · TVCF 레퍼런스 · 영화 명장면 원테이크 샷과 초반 3초 훅, 시네마틱 색감과 영상 연출 구도를 고화질 무빙 루프로 탐색·캡처하는 디렉터용 비주얼 레퍼런스 아카이브.",
  keywords: [
    "광고 레퍼런스 사이트",
    "TVCF 레퍼런스",
    "영상 연출 구도",
    "초반 3초 훅",
    "원테이크 샷",
    "시네마틱 색감 아카이브",
    "CF 콘티 레퍼런스",
    "영화 미장센 아카이브",
    "film visual reference",
    "commercial visual reference",
    "cinematography reference archive",
    "KINOFRAME",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: SITE_URL,
    siteName: "KINOFRAME",
    title: "KINOFRAME — 광고·영화 영상 연출 레퍼런스 무빙 아카이브",
    description:
      "고화질 컬러 영화 본편 미장센과 글로벌 아이코닉 TVCF 무빙 루프를 한눈에 탐색하고 1클릭 프레임 캡처·보드 저장까지 끝내는 디렉터용 아카이브.",
  },
  twitter: {
    card: "summary_large_image",
    title: "KINOFRAME — 광고·영화 영상 연출 레퍼런스 아카이브",
    description:
      "TVCF 레퍼런스, 원테이크 샷, 초반 3초 훅, 시네마틱 색감 아카이브 — film & commercial visual reference.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
};

const STRUCTURED_DATA = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "KINOFRAME",
    alternateName: "키노프레임 광고·영화 영상 레퍼런스 아카이브",
    url: SITE_URL,
    inLanguage: ["ko", "en"],
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "KINOFRAME Cinema & TVCF Visual Reference Archive",
    description:
      "Curated high-definition moving archive of iconic cinema scenes and TV commercials for film directors, commercial art directors, and cinematographers.",
    url: SITE_URL,
    about: [
      "광고 레퍼런스 사이트",
      "TVCF 레퍼런스",
      "영상 연출 구도",
      "초반 3초 훅",
      "원테이크 샷",
      "시네마틱 색감 아카이브",
      "film & commercial visual reference",
    ],
  },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
      </head>
      <body className="bg-[#0A0B0E] text-[#F2EFE9] antialiased selection:bg-[#C89E52]/35 selection:text-[#F2EFE9]">
        <div className="relative z-10 min-h-screen bg-[#0A0B0E]">{children}</div>
      </body>
    </html>
  );
}
