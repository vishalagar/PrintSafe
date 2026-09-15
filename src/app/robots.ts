import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/d/", "/status/", "/api/", "/admin/"],
    },
    sitemap: "https://printsafe.in/sitemap.xml",
  };
}
