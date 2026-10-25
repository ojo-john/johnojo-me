/**
 * Cloudflare Pages Function: GET /api/metrics. Returns aggregate counts for the admin metrics page.
 * Must be covered by the same Cloudflare Access application as /admin/* (docs/METRICS.md); the Access
 * token is verified again inside, so a missing policy fails closed. Logic: src/lib/metrics/handlers.ts.
 */
import { defaultAccessDeps } from "../../src/lib/metrics/access";
import type { MetricsEnv, PagesFunction } from "../../src/lib/metrics/cf";
import { handleMetrics } from "../../src/lib/metrics/handlers";

export const onRequest: PagesFunction<MetricsEnv> = ({ request, env }) => handleMetrics(request, env, defaultAccessDeps(), (...a) => fetch(...a));
