/** /api/github/*: the editor's GitHub API, with the site's token added server-side. Logic: src/lib/github-proxy/handler.ts. */
import { defaultAccessDeps } from "../../../src/lib/metrics/access";
import type { PagesFunction } from "../../../src/lib/metrics/cf";
import { handleGitHubProxy, type GitHubProxyEnv } from "../../../src/lib/github-proxy/handler";

export const onRequest: PagesFunction<GitHubProxyEnv> = ({ request, env }) => handleGitHubProxy(request, env, defaultAccessDeps(), (...a) => fetch(...a));
