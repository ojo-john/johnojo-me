import { getAdminDashboard } from "@/lib/content/load";

// Data for the admin dashboard (/admin/): stats, the "needs you" checklist and every trip, drafts
// included. Written at build time under /admin/, so it's behind the same login as the editor.
export const dynamic = "force-static";

export function GET() {
  return Response.json(getAdminDashboard());
}
