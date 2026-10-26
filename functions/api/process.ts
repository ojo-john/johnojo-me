/** POST /api/process: starts the media job on GitHub. Behind Cloudflare Access (see docs/MEDIA.md). */
import { defaultAccessDeps } from "../../src/lib/metrics/access";
import type { PagesFunction } from "../../src/lib/metrics/cf";
import { handleProcess, type MediaAdminEnv } from "../../src/lib/media-admin/handlers";

export const onRequest: PagesFunction<MediaAdminEnv> = ({ request, env }) => handleProcess(request, env, defaultAccessDeps(), (...a) => fetch(...a));
