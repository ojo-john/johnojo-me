/**
 * Cloudflare Web Analytics: cookieless, no personal data, no cross-site tracking. It records page views
 * and real-visitor Core Web Vitals (LCP, INP, CLS) per page, shown in the Cloudflare dashboard under
 * Analytics & Logs → Web Analytics → Core Web Vitals. Off unless the beacon token is set at build time.
 */
export function Analytics() {
  const token = process.env.NEXT_PUBLIC_CF_BEACON_TOKEN;
  if (!token) return null;
  return <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon={JSON.stringify({ token, spa: true })} />;
}
