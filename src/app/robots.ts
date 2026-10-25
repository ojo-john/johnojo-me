import type { MetadataRoute } from "next";
import { getSite } from "@/lib/content/load";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: "/admin/" }, sitemap: `https://${getSite().domain}/sitemap.xml` };
}
