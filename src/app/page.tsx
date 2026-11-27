import Link from "next/link";
import { ArchiveWorkbenchClient } from "@/components/ArchiveWorkbenchClient";
import { loadWallActiveCatalog } from "@/lib/poc-loader";
import { SEO_TOPICS } from "@/lib/seo-topics";

// ISR shell (SEO link graph only); the wall itself is fetched live by the browser.
export const revalidate = 300;

export default async function HomePage() {
  const { items } = await loadWallActiveCatalog({ revalidateSeconds: 300 });
  return (
    <>
      <ArchiveWorkbenchClient aspects={items.slice(0, 15).map((item) => item.aspectRatio)} />
      {/* Semantic Crawler & Screen-Reader Internal Link Graph (0px visual change) */}
      <nav aria-label="주제별 아카이브 탐색 허브" className="sr-only">
        <ul>
          {SEO_TOPICS.map((topic) => (
            <li key={topic.slug}>
              <Link href={`/discover/${topic.slug}`}>{topic.h1}</Link>
            </li>
          ))}
          {items.slice(0, 60).map((entry) => (
            <li key={entry.id}>
              <Link href={`/shot/${encodeURIComponent(entry.id)}`}>
                {entry.titleKo} ({entry.year})
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
