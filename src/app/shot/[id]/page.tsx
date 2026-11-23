import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadFullCatalogForLookup } from "@/lib/poc-loader";
import { resolveItemCategory } from "@/lib/taxonomy";
import { KinoframeLogo } from "@/components/KinoframeLogo";

export const revalidate = 300;

const SITE_URL = "https://kinoframe.vercel.app";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const catalog = await loadFullCatalogForLookup();
  const item = catalog.find(
    (entry) => entry.id.toLowerCase() === id.toLowerCase()
  );

  if (!item) {
    return {
      title: "클립을 찾을 수 없습니다",
      robots: { index: false, follow: false },
    };
  }

  const category = resolveItemCategory(item);
  const categoryKo = category === "TVCF" ? "TVCF 광고 레퍼런스" : "영화 미장센 레퍼런스";
  const title = `${item.titleKo} (${item.year}) — ${categoryKo} · 영상 연출 구도`;
  const description = `${item.originalTitle} · ${item.brandOrSource}. ${item.breakdown.hook3s} ${item.breakdown.framing} 시네마틱 색감 팔레트(${item.palette.join(", ")})와 원테이크 루프 레퍼런스.`;

  return {
    title,
    description,
    keywords: [
      item.titleKo,
      item.originalTitle,
      item.brandOrSource,
      categoryKo,
      "광고 레퍼런스 사이트",
      "TVCF 레퍼런스",
      "영상 연출 구도",
      "초반 3초 훅",
      "원테이크 샷",
      "시네마틱 색감 아카이브",
      ...item.compositionTags,
      ...item.persuasionTags,
    ],
    alternates: {
      canonical: `/shot/${item.id}`,
    },
    openGraph: {
      type: "video.other",
      url: `${SITE_URL}/shot/${item.id}`,
      title,
      description,
      images: [
        {
          url: item.thumbnailUrl,
          alt: `${item.titleKo} (${item.year})`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [item.thumbnailUrl],
    },
  };
}

export default async function ShotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const catalog = await loadFullCatalogForLookup();
  const item = catalog.find(
    (entry) => entry.id.toLowerCase() === id.toLowerCase()
  );

  if (!item) {
    notFound();
  }

  const category = resolveItemCategory(item);
  const genreBadge = category === "TVCF" ? "TVCF" : "Cinema";

  const related = catalog
    .filter((entry) => entry.id !== item.id)
    .sort((a, b) => {
      const sameCatA = resolveItemCategory(a) === category ? 1 : 0;
      const sameCatB = resolveItemCategory(b) === category ? 1 : 0;
      return sameCatB - sameCatA;
    })
    .slice(0, 10);

  const videoSchema = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: `${item.titleKo} (${item.year})`,
    description: `${item.originalTitle} — ${item.breakdown.hook3s} ${item.breakdown.framing}`,
    thumbnailUrl: [item.thumbnailUrl],
    contentUrl: item.previewVideoUrl || item.sourceUrl,
    embedUrl: `${SITE_URL}/shot/${item.id}`,
    uploadDate: `${item.addedAt || "2026-11-23"}T00:00:00Z`,
    duration: `PT${Math.max(1, Math.round(item.durationSec || 5))}S`,
    publisher: {
      "@type": "Organization",
      name: "KINOFRAME",
      url: SITE_URL,
    },
  };

  return (
    <div className="min-h-screen bg-[#0A0B0E] text-[#F2EFE9]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(videoSchema) }}
      />

      <header className="sticky top-0 z-40 flex h-[clamp(60px,3.8vw,80px)] items-center justify-between border-b border-white/[0.08] bg-[#0A0B0E]/95 px-5 backdrop-blur-md sm:px-8">
        <Link href="/" aria-label="KINOFRAME 홈">
          <KinoframeLogo className="h-[clamp(19px,1.2vw,26px)] w-auto" />
        </Link>
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-full bg-[#C89E52] px-5 text-[14px] font-semibold text-[#0A0B0E] transition-colors hover:bg-[#D9B36A]"
        >
          전체 아카이브 월 보기
        </Link>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8">
        <article className="rounded-[24px] bg-[#111318] p-5 ring-1 ring-white/[0.12] sm:p-8">
          <div className="flex w-full items-center justify-center overflow-hidden rounded-[16px] bg-[#060709] ring-1 ring-white/[0.08]">
            {item.mediaSource === "archive_mp4" && item.previewVideoUrl ? (
              <video
                src={item.previewVideoUrl}
                poster={item.thumbnailUrl}
                autoPlay
                muted
                loop
                playsInline
                controls
                className="max-h-[72vh] w-full object-contain"
              />
            ) : (
              <img
                src={item.thumbnailUrl}
                alt={item.titleKo}
                className="max-h-[72vh] w-full object-contain"
              />
            )}
          </div>

          <div className="mt-6 flex flex-col gap-5 border-t border-white/[0.1] pt-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-[#C89E52] px-3.5 py-1 font-mono text-xs font-bold uppercase tracking-wider text-[#0A0B0E]">
                  {genreBadge}
                </span>
                <h1 className="text-[clamp(1.3rem,1.6vw,2.1rem)] font-bold tracking-tight text-[#F2EFE9]">
                  {item.titleKo}
                </h1>
                <span className="font-mono text-lg font-semibold text-[#C89E52]">
                  ({item.year})
                </span>
              </div>
              <p className="mt-2 text-[15px] text-[#C8C4BC]">
                {item.originalTitle} · {item.brandOrSource} · {item.aspectRatio}
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-[#7E7B74]">
                {item.breakdown.hook3s} — {item.breakdown.framing}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <div
                className="flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-[#0A0B0E] px-3 py-2"
                aria-label="대표 5색 컬러 팔레트"
              >
                {item.palette.map((hex) => (
                  <span
                    key={hex}
                    title={hex}
                    className="h-5 w-5 rounded-full ring-1 ring-white/20"
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
              <Link
                href={`/?board=${encodeURIComponent(item.id)}`}
                className="inline-flex h-11 items-center rounded-full bg-[#C89E52] px-6 text-[15px] font-semibold text-[#0A0B0E] transition-colors hover:bg-[#D9B36A]"
              >
                메인 월에서 열기
              </Link>
            </div>
          </div>
        </article>

        {/* Related Moving References */}
        <section className="mt-10" aria-label="연관 영상 연출 레퍼런스">
          <h2 className="mb-4 text-[18px] font-semibold text-[#F2EFE9]">
            연관 시네마 · TVCF 레퍼런스
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {related.map((rel) => (
              <Link
                key={rel.id}
                href={`/shot/${rel.id}`}
                className="group overflow-hidden rounded-[14px] bg-[#111318] ring-1 ring-white/[0.08] transition-colors hover:ring-[#C89E52]/60"
              >
                <div className="aspect-video w-full overflow-hidden bg-[#060709]">
                  <img
                    src={rel.thumbnailUrl}
                    alt={rel.titleKo}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="p-2.5">
                  <p className="truncate text-[13px] font-medium text-[#F2EFE9]">
                    {rel.titleKo}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-[#7E7B74]">
                    {rel.year} · {rel.aspectRatio}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
