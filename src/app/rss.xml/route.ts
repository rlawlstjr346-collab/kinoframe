import { NextResponse } from "next/server";
import { loadFullCatalogForLookup, loadWallActiveCatalog } from "@/lib/poc-loader";
import { SEO_TOPICS, formatSeoItemMeta, getSiteUrl } from "@/lib/seo-topics";

export const revalidate = 300;

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRfc822Date(raw?: string): string {
  if (!raw) return new Date().toUTCString();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
}

function safeCdata(input: string): string {
  return input.replace(/]]>/g, "]]]]><![CDATA[>");
}

export async function GET() {
  const siteUrl = getSiteUrl();
  const [{ items: wallItems }, fullItems] = await Promise.all([
    loadWallActiveCatalog({ revalidateSeconds: 300 }),
    loadFullCatalogForLookup({ revalidateSeconds: 300 }),
  ]);

  const activeItems = wallItems.length > 0 ? wallItems : fullItems;
  const sortedClips = [...activeItems]
    .sort((a, b) => {
      const da = a.harvestedAt || a.addedAt || "";
      const db = b.harvestedAt || b.addedAt || "";
      return db.localeCompare(da);
    })
    .slice(0, 120);

  const nowRfc822 = new Date().toUTCString();
  const entriesXml: string[] = [];

  // 1. All 6 non-branded Search-Intent Discover Hubs
  for (const topic of SEO_TOPICS) {
    const link = `${siteUrl}/discover/${encodeURIComponent(topic.slug)}`;
    const bodyHtml = `<p>${escapeXml(topic.lead)}</p><p>키워드: ${escapeXml(
      topic.keywords.join(", ")
    )}</p><p><a href="${escapeXml(link)}">KINOFRAME ${escapeXml(
      topic.labelKo
    )} 아카이브 바로 보기</a></p>`;

    entriesXml.push(
      [
        "    <item>",
        `      <title>${escapeXml(topic.metaTitle)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <pubDate>${nowRfc822}</pubDate>`,
        `      <category>${escapeXml(topic.labelKo)}</category>`,
        `      <description><![CDATA[${safeCdata(bodyHtml)}]]></description>`,
        "    </item>",
      ].join("\n")
    );
  }

  // 2. Latest active moving archive clips with full descriptive body (Naver Search Advisor RSS 2.0 spec)
  for (const item of sortedClips) {
    const link = `${siteUrl}/shot/${encodeURIComponent(item.id)}`;
    const clean = formatSeoItemMeta(item);
    const hookText = item.breakdown?.hook3s || item.breakdown?.hook || "";
    const framingText = item.breakdown?.framing || item.breakdown?.camera || "";
    const tags = [
      ...(item.compositionTags || []),
      ...(item.persuasionTags || []),
    ].join(", ");
    const paletteStr = (item.palette || []).join(", ");

    const bodyHtml = [
      `<p><strong>${escapeXml(clean.primaryTitle)}</strong> (${escapeXml(
        clean.subCaption
      )})</p>`,
      item.thumbnailUrl
        ? `<p><img src="${escapeXml(item.thumbnailUrl)}" alt="${escapeXml(
            clean.primaryTitle
          )}" /></p>`
        : "",
      hookText || framingText
        ? `<p>${escapeXml(hookText)}${
            hookText && framingText ? " — " : ""
          }${escapeXml(framingText)}</p>`
        : "",
      tags ? `<p>연출 구도 및 태그: ${escapeXml(tags)}</p>` : "",
      paletteStr
        ? `<p>대표 시네마틱 컬러 팔레트: ${escapeXml(
            paletteStr
          )} · 화면비 ${escapeXml(item.aspectRatio)}</p>`
        : "",
      `<p><a href="${escapeXml(link)}">KINOFRAME에서 고화질 루프 보기</a></p>`,
    ]
      .filter(Boolean)
      .join("");

    entriesXml.push(
      [
        "    <item>",
        `      <title>${escapeXml(
          `${clean.primaryTitle} (${item.year}) — ${
            item.category === "TVCF" ? "TVCF 광고 레퍼런스" : "영화 미장센 레퍼런스"
          }`
        )}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <pubDate>${toRfc822Date(item.harvestedAt || item.addedAt)}</pubDate>`,
        `      <category>${escapeXml(
          item.category === "TVCF" ? "TVCF" : "Cinema"
        )}</category>`,
        `      <description><![CDATA[${safeCdata(bodyHtml)}]]></description>`,
        "    </item>",
      ].join("\n")
    );
  }

  const rssXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    "    <title>KINOFRAME — 광고·영화 영상 연출 레퍼런스 무빙 아카이브</title>",
    `    <link>${escapeXml(siteUrl)}</link>`,
    `    <atom:link href="${escapeXml(
      `${siteUrl}/rss.xml`
    )}" rel="self" type="application/rss+xml" />`,
    "    <description>광고 레퍼런스 사이트 · TVCF 레퍼런스 · 영화 명장면 원테이크 샷과 초반 3초 훅, 시네마틱 색감과 영상 연출 구도 아카이브.</description>",
    "    <language>ko</language>",
    `    <lastBuildDate>${nowRfc822}</lastBuildDate>`,
    entriesXml.join("\n"),
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");

  return new NextResponse(rssXml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
