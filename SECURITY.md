# Security

Please report a vulnerability privately through GitHub: **Security → Report a vulnerability** on this
repository. Don't open a public issue.

What's in scope: johnojo.me and the code here, especially the admin (`/admin/*`, `/api/*`, which sit
behind Cloudflare Access and verify its token themselves) and the GitHub proxy (`src/lib/github-proxy/`).

No secrets live in this repository: storage keys and tokens are Cloudflare Pages secrets or in a
git-ignored `.env.local`. Every push is scanned with gitleaks, and GitHub secret scanning is on.
