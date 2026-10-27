/** Runs before every /admin/* file: redirects other hosts to the real one and verifies the Access login. Logic: src/lib/media-admin/admin-gate.ts. */
import { defaultAccessDeps } from "../../src/lib/metrics/access";
import { gateAdmin, type AdminGateEnv } from "../../src/lib/media-admin/admin-gate";

export const onRequest = ({ request, env, next }: { request: Request; env: AdminGateEnv; next: () => Promise<Response> }) => gateAdmin(request, env, defaultAccessDeps(), next);
