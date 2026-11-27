import type { MetadataRoute } from "next";
import { loadFullCatalogForLookup, loadWallActiveCatalog } from "@/lib/poc-loader";
import { SEO_TOPICS, getSiteUrl } from "@/lib/seo-topics";

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const [fullCatalog, wallResult] = await Promise.all([
    loadFullCatalogForLookup({ revalidateSeconds: 300 }),
    loadWallActiveCatalog({ revalidateSeconds: 300 }),
  ]);

  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
  ];

  // All non-branded search intent landing hubs (/discover/[slug])
  for (const topic of SEO_TOPICS) {
    entries.push({
      url: `${siteUrl}/discover/${encodeURIComponent(topic.slug)}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    });
  }

  // Deduplicated full catalog (catalog-full.json with wall-active.json merge/fallback)
  const seenIds = new Set<string>();
  const combined = [...fullCatalog, ...wallResult.items];
  for (const item of combined) {
    if (!item.id || seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    const rawDate = item.harvestedAt || item.addedAt;
    const parsedDate = rawDate ? new Date(rawDate) : now;
    const lastModified = Number.isNaN(parsedDate.getTime()) ? now : parsedDate;
    entries.push({
      url: `${siteUrl}/shot/${encodeURIComponent(item.id)}`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }

  return entries;
}
