import { getAdminMediaIndex } from "@/lib/content/load";

// The editor's cover picker reads this list of every photo per visit and per trip (hidden ones
// included). Written to /admin/media.json at build time, so it sits behind the same Cloudflare Access
// login as the editor.
export const dynamic = "force-static";

export function GET() {
  return Response.json(getAdminMediaIndex());
}
