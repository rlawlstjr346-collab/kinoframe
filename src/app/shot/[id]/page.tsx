import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadFullCatalogForLookup } from "@/lib/poc-loader";
import { resolveItemCategory } from "@/lib/taxonomy";
import {
  SEO_TOPICS,
  formatSeoItemMeta,
  getSiteUrl,
  resolveSeoSourceUrl,
} from "@/lib/seo-topics";
import { KinoframeLogo } from "@/components/KinoframeLogo";
import { toStreamingMediaUrl } from "@/lib/media-url";

export const revalidate = 300;

// Rendered on first visit, then served from the ISR cache (no shot is prebuilt at deploy time).
export function generateStaticParams() {
  return [];
}

const SITE_URL = getSiteUrl();

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
  const categoryKo =
    category === "TVCF" ? "TVCF 광고 레퍼런스" : "영화 미장센 레퍼런스";
  const { primaryTitle } = formatSeoItemMeta(item);
  const title = `${primaryTitle} (${item.year}) — ${categoryKo} · 영상 연출 구도`;
  const hookText = item.breakdown?.hook3s || item.breakdown?.hook || "";
  const frameText = item.breakdown?.framing || item.breakdown?.camera || "";
  const description = `${item.originalTitle} · ${item.brandOrSource}. ${hookText} ${frameText} 시네마틱 색감 팔레트(${item.palette.join(", ")})와 원테이크 루프 레퍼런스.`;

  return {
    title,
    description,
    keywords: [
      primaryTitle,
      item.originalTitle,
      item.brandOrSource,
      ...(item.aliases || []),
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
          alt: `${primaryTitle} (${item.year})`,
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
  const { primaryTitle, subCaption } = formatSeoItemMeta(item);
  const externalSourceUrl = resolveSeoSourceUrl(item);
  const hookText = item.breakdown?.hook3s || item.breakdown?.hook || "";
  const frameText = item.breakdown?.framing || item.breakdown?.camera || "";

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
    name: `${primaryTitle} (${item.year})`,
    description: `${item.originalTitle} — ${hookText} ${frameText}`,
    thumbnailUrl: [item.thumbnailUrl],
    contentUrl: item.previewVideoUrl || externalSourceUrl,
    embedUrl: `${SITE_URL}/shot/${item.id}`,
    uploadDate: `${(item.addedAt || "2026-11-23").slice(0, 10)}T00:00:00Z`,
    duration: `PT${Math.max(1, Math.round(item.durationSec || 5))}S`,
    publisher: {
      "@type": "Organization",
      name: "KINOFRAME",
      url: SITE_URL,
    },
  };

  return (
    <div className="min-h-screen bg-[#08080A] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(videoSchema) }}
      />

      <header className="sticky top-0 z-40 flex h-[clamp(62px,3.8vw,78px)] items-center justify-between border-b border-white/[0.08] bg-[#08080A]/80 px-5 backdrop-blur-2xl sm:px-8">
        <Link href="/" aria-label="KINOFRAME 홈">
          <KinoframeLogo className="h-[clamp(19px,1.2vw,26px)] w-auto" />
        </Link>
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-full bg-white px-5 text-[14px] font-semibold text-[#111111] transition-colors hover:bg-white/90"
        >
          전체 아카이브 월 보기
        </Link>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8">
        <article className="mx-auto w-fit max-w-full rounded-[30px] border border-white/[0.12] bg-[#1C1C1E]/85 p-4 backdrop-blur-2xl sm:p-6">
          <div className="overflow-hidden rounded-[20px] bg-[#0B0B0D]">
            {item.mediaSource === "archive_mp4" && item.previewVideoUrl ? (
              <video
                src={toStreamingMediaUrl(item.previewVideoUrl) ?? undefined}
                poster={toStreamingMediaUrl(item.thumbnailUrl) ?? undefined}
                crossOrigin="anonymous"
                autoPlay
                muted
                loop
                playsInline
                controls
                className="block max-h-[72vh] max-w-full w-auto h-auto"
              />
            ) : (
              <img
                src={item.thumbnailUrl}
                alt={primaryTitle}
                className="block max-h-[72vh] max-w-full w-auto h-auto"
              />
            )}
          </div>

          <div className="mt-5 flex flex-col gap-4 px-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-[clamp(1.25rem,1.4vw,1.9rem)] font-semibold tracking-[-0.02em] text-white">
                {primaryTitle}
              </h1>
              <p className="mt-1 text-[15px] text-[#98989D]">
                {subCaption} · {item.aspectRatio}
              </p>
              {(hookText || frameText) && (
                <p className="mt-2 max-w-[68ch] text-[14px] leading-relaxed text-[#C9C6BF]">
                  {hookText}
                  {hookText && frameText ? " — " : ""}
                  {frameText}
                </p>
              )}
              {item.opticsTags && item.opticsTags.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="광학·연출 태그">
                  {item.opticsTags.map((tag) => (
                    <li key={tag} className="rounded-full border border-white/[0.12] px-2.5 py-1 text-[12.5px] text-[#A8A8AE]">
                      #{tag}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2.5">
              <div
                className="flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.06] px-3 py-2"
                aria-label="대표 5색 컬러 팔레트"
              >
                {item.palette.map((hex) => (
                  <span
                    key={hex}
                    title={hex}
                    className="h-4 w-4 rounded-full ring-1 ring-white/20"
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
              <a
                href={externalSourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center rounded-full bg-white px-5 text-[14px] font-semibold text-[#111111] transition-colors hover:bg-white/90"
              >
                원본 보기 ↗
              </a>
            </div>
          </div>
        </article>

        {/* Related Moving References */}
        <section className="mt-10" aria-label="연관 영상 연출 레퍼런스">
          <h2 className="mb-4 text-[18px] font-semibold tracking-[-0.02em] text-white">
            연관 시네마 · TVCF 레퍼런스
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {related.map((rel) => {
              const relMeta = formatSeoItemMeta(rel);
              return (
                <Link
                  key={rel.id}
                  href={`/shot/${rel.id}`}
                  className="group overflow-hidden rounded-[18px] bg-[#141416] ring-1 ring-white/[0.07] transition-all duration-200 hover:ring-white/[0.22]"
                >
                  <div className="aspect-video w-full overflow-hidden bg-[#0B0B0D]">
                    <img
                      src={rel.thumbnailUrl}
                      alt={relMeta.primaryTitle}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="p-2.5">
                    <p className="truncate text-[13px] font-medium text-white">
                      {relMeta.primaryTitle}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#98989D]">
                      {rel.year} · {rel.aspectRatio}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </main>

      {/* Semantic Crawler Internal Link Graph to Discover Hubs (0px visual change) */}
      <nav aria-label="주제별 아카이브 탐색 허브" className="sr-only">
        <ul>
          {SEO_TOPICS.map((topic) => (
            <li key={topic.slug}>
              <Link href={`/discover/${topic.slug}`}>{topic.h1}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
