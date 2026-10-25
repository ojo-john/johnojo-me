/**
 * Cloudflare Pages Function: POST /api/collect. Receives one privacy-safe event from the site's tracker
 * and counts it in Workers Analytics Engine. Logic and checks live in src/lib/metrics/handlers.ts.
 * Not part of the Next.js build; Cloudflare Pages bundles everything in functions/ on deploy.
 */
import type { MetricsEnv, PagesFunction } from "../../src/lib/metrics/cf";
import { handleCollect } from "../../src/lib/metrics/handlers";

export const onRequest: PagesFunction<MetricsEnv> = ({ request, env }) => handleCollect(request, env);
