/** GET /admin/draft-media/<file>: a draft's web copy, for the admin preview. Behind Cloudflare Access (see docs/DEPLOY.md). */
import { defaultAccessDeps } from "../../../src/lib/metrics/access";
import type { PagesFunction } from "../../../src/lib/metrics/cf";
import { handleDraftMedia, type MediaAdminEnv } from "../../../src/lib/media-admin/handlers";

export const onRequest: PagesFunction<MediaAdminEnv> = ({ request, env }) => handleDraftMedia(request, env, defaultAccessDeps());
