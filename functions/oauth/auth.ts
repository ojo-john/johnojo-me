/** GET /oauth/auth: starts "Sign in with GitHub" for the editor. Logic: src/lib/oauth/relay.ts. */
import { handleAuth, type OAuthEnv } from "../../src/lib/oauth/relay";

export const onRequestGet = ({ request, env }: { request: Request; env: OAuthEnv }) => handleAuth(request, env);
