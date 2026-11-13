// Liveness probe: the process is up. Does not touch the database.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" });
}
