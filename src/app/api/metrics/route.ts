import { timingSafeEqual } from "node:crypto";
import { metrics } from "@/lib/metrics";

// Prometheus scrape endpoint. Set METRICS_TOKEN to require a bearer token.
export const dynamic = "force-dynamic";

function authorised(request: Request) {
  const token = process.env.METRICS_TOKEN;
  if (!token) return true;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorised(request)) return new Response("unauthorised", { status: 401 });
  return new Response(await metrics.registry.metrics(), {
    headers: { "content-type": metrics.registry.contentType },
  });
}
