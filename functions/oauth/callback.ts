/** GET /oauth/callback: GitHub's redirect after sign-in. Logic: src/lib/oauth/relay.ts. */
import { handleCallback, type OAuthEnv } from "../../src/lib/oauth/relay";

export const onRequestGet = ({ request, env }: { request: Request; env: OAuthEnv }) => handleCallback(request, env, (...a) => fetch(...a));
