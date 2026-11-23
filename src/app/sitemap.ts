import type { MetadataRoute } from "next";
import { loadFullCatalogForLookup } from "@/lib/poc-loader";

export const revalidate = 300;

const SITE_URL = "https://kinoframe.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalog = await loadFullCatalogForLookup();
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
  ];

  for (const item of catalog) {
    const parsedDate = item.addedAt ? new Date(item.addedAt) : now;
    const lastModified = Number.isNaN(parsedDate.getTime()) ? now : parsedDate;
    entries.push({
      url: `${SITE_URL}/shot/${encodeURIComponent(item.id)}`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }

  return entries;
}
