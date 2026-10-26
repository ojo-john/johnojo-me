/** PUT /api/upload: the admin upload page sends originals here. Behind Cloudflare Access (see docs/MEDIA.md). */
import { defaultAccessDeps } from "../../src/lib/metrics/access";
import type { PagesFunction } from "../../src/lib/metrics/cf";
import { handleUpload, type MediaAdminEnv } from "../../src/lib/media-admin/handlers";

export const onRequest: PagesFunction<MediaAdminEnv> = ({ request, env }) => handleUpload(request, env, defaultAccessDeps());
