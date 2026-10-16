import type { MetadataRoute } from "next";

const SITE = "https://www.woodpeckeros.com";

export default function robots(): MetadataRoute.Robots {
  return {
    // Old prototypes. /notebook stays crawlable so its noindex is seen (it is linked from the home page).
    rules: { userAgent: "*", allow: "/", disallow: ["/canvas", "/today", "/v2", "/pair"] },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
