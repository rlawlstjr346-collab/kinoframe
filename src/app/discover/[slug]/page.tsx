import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadWallActiveCatalog } from "@/lib/poc-loader";
import {
  SEO_TOPICS,
  filterItemsBySeoTopic,
  formatSeoItemMeta,
  getSeoTopicBySlug,
  getSiteUrl,
} from "@/lib/seo-topics";
import { KinoframeLogo } from "@/components/KinoframeLogo";

export const revalidate = 300;

export function generateStaticParams() {
  return SEO_TOPICS.map((topic) => ({ slug: topic.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const topic = getSeoTopicBySlug(slug);
  if (!topic) {
    return {
      title: "탐색 주제를 찾을 수 없습니다",
      robots: { index: false, follow: false },
    };
  }

  const siteUrl = getSiteUrl();
  const canonicalPath = `/discover/${topic.slug}`;
  return {
    title: topic.metaTitle,
    description: topic.metaDescription,
    keywords: topic.keywords,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: "website",
      locale: "ko_KR",
      url: `${siteUrl}${canonicalPath}`,
      siteName: "KINOFRAME",
      title: `${topic.metaTitle} | KINOFRAME`,
      description: topic.metaDescription,
    },
    twitter: {
      card: "summary_large_image",
      title: `${topic.metaTitle} | KINOFRAME`,
      description: topic.metaDescription,
    },
  };
}

export default async function DiscoverTopicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const topic = getSeoTopicBySlug(slug);
  if (!topic) {
    notFound();
  }

  const siteUrl = getSiteUrl();
  const { items } = await loadWallActiveCatalog();
  const matchedItems = filterItemsBySeoTopic(items, topic);

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: topic.h1,
    description: topic.metaDescription,
    url: `${siteUrl}/discover/${topic.slug}`,
    inLanguage: ["ko", "en"],
    isPartOf: {
      "@type": "WebSite",
      name: "KINOFRAME",
      url: siteUrl,
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: matchedItems.length,
      itemListElement: matchedItems.slice(0, 48).map((entry, idx) => {
        const clean = formatSeoItemMeta(entry);
        return {
          "@type": "ListItem",
          position: idx + 1,
          url: `${siteUrl}/shot/${encodeURIComponent(entry.id)}`,
          name: `${clean.primaryTitle} (${entry.year})`,
          image: entry.thumbnailUrl,
        };
      }),
    },
  };

  return (
    <div className="min-h-screen bg-[#08080A] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
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

      <main className="mx-auto max-w-[1680px] px-4 py-8 sm:px-6 lg:px-8">
        {/* Topic Header & Sibling Discover Hub Navigation */}
        <section className="rounded-[28px] border border-white/[0.10] bg-[#1C1C1E]/85 p-6 backdrop-blur-2xl sm:p-8">
          <p className="text-[13px] font-medium uppercase tracking-wider text-[#98989D]">
            {topic.labelEn}
          </p>
          <h1 className="mt-2 text-[clamp(1.5rem,2.1vw,2.5rem)] font-semibold tracking-[-0.02em] text-white">
            {topic.h1}
          </h1>
          <p className="mt-3 max-w-3xl text-[clamp(14px,0.92vw,17px)] leading-relaxed text-[#98989D]">
            {topic.lead}
          </p>

          <nav
            aria-label="주제별 영상 레퍼런스 허브"
            className="mt-6 flex flex-wrap items-center gap-2"
          >
            {SEO_TOPICS.map((sib) => {
              const active = sib.slug === topic.slug;
              return (
                <Link
                  key={sib.slug}
                  href={`/discover/${sib.slug}`}
                  className={`inline-flex h-9 items-center rounded-full px-4 text-[13.5px] font-medium transition-colors ${
                    active
                      ? "bg-white text-[#111111]"
                      : "border border-white/[0.10] bg-white/[0.08] text-white hover:bg-white/[0.16]"
                  }`}
                >
                  {sib.labelKo}
                </Link>
              );
            })}
          </nav>
        </section>

        {/* Matched Moving Reference Wall linking directly to individual /shot/[id] pages */}
        <section
          aria-label={`${topic.labelKo} 클립 아카이브`}
          className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
        >
          {matchedItems.map((entry) => {
            const clean = formatSeoItemMeta(entry);
            return (
              <Link
                key={entry.id}
                href={`/shot/${encodeURIComponent(entry.id)}`}
                className="group overflow-hidden rounded-[18px] bg-[#141416] ring-1 ring-white/[0.07] transition-all duration-200 hover:ring-white/[0.22]"
              >
                <div className="aspect-video w-full overflow-hidden bg-[#0B0B0D]">
                  <img
                    src={entry.thumbnailUrl}
                    alt={`${clean.primaryTitle} (${entry.year})`}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="p-3">
                  <h2 className="truncate text-[14px] font-semibold tracking-[-0.015em] text-white">
                    {clean.primaryTitle}
                  </h2>
                  <p className="mt-0.5 truncate text-[12px] text-[#98989D]">
                    {clean.subCaption}
                  </p>
                </div>
              </Link>
            );
          })}
        </section>
      </main>
    </div>
  );
}
