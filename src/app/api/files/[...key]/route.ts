import { getAppContext } from "@/lib/session";
import { getFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", csv: "text/csv" };

/** Serves stored files. Keys are prefixed with the tenant id, so a member of
 * one tenant can never fetch another tenant's file. */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const ctx = await getAppContext();
  if (!ctx) return new Response("Not found", { status: 404 });
  const { key } = await params;
  const path = key.join("/");
  if (!path.startsWith(`${ctx.tenant.id}/`) || path.includes("..")) return new Response("Not found", { status: 404 });
  const folder = key[1];
  const allowed = folder === "invoices" ? ctx.can("licences.manage") || ctx.can("procurement.manage") : ctx.can("employees.read");
  if (!allowed) return new Response("Not found", { status: 404 });
  try {
    const body = await getFile(path);
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    return new Response(new Uint8Array(body), {
      headers: {
        "content-type": TYPES[ext] ?? "application/octet-stream",
        "content-disposition": `inline; filename="${path.split("/").pop()?.replace(/^[0-9a-f-]{36}-/, "")}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, max-age=300",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
