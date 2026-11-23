import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/shot/"],
        disallow: ["/api/"],
      },
    ],
    sitemap: "https://kinoframe.vercel.app/sitemap.xml",
    host: "https://kinoframe.vercel.app",
  };
}
