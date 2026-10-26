/** GET /api/preview/<id>.jpg: the photo tool's uncropped working copy. Behind Cloudflare Access (see docs/MEDIA.md). */
import { defaultAccessDeps } from "../../../src/lib/metrics/access";
import type { PagesFunction } from "../../../src/lib/metrics/cf";
import { handlePreview, type MediaAdminEnv } from "../../../src/lib/media-admin/handlers";

export const onRequest: PagesFunction<MediaAdminEnv> = ({ request, env }) => handlePreview(request, env, defaultAccessDeps());
