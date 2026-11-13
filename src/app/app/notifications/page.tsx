import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { Card, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { notifications } from "@/db/schema";
import { requireAction, requirePage, tenantTx } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";

async function markAllRead() {
  "use server";
  const ctx = await requireAction();
  await tenantTx(ctx, (tx) =>
    tx.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt))),
  );
  revalidatePath("/app", "layout");
}

export default async function NotificationsPage() {
  const ctx = await requirePage();
  const rows = await tenantTx(ctx, (tx) =>
    tx.select().from(notifications).where(eq(notifications.userId, ctx.user.id)).orderBy(desc(notifications.createdAt)).limit(100),
  );
  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          <form action={markAllRead}>
            <button className={buttonClass("secondary")}>Mark all as read</button>
          </form>
        }
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState>You have no notifications.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((n) => (
              <li key={n.id} className={`flex gap-3 py-3 ${n.readAt ? "opacity-60" : ""}`}>
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-slate-300" : "bg-brand"}`} />
                <div className="min-w-0 flex-1">
                  {n.href ? (
                    <Link href={n.href} className="font-medium text-slate-900 hover:underline">{n.title}</Link>
                  ) : (
                    <p className="font-medium">{n.title}</p>
                  )}
                  {n.body ? <p className="text-sm text-slate-600">{n.body}</p> : null}
                </div>
                <span className="shrink-0 text-xs text-slate-500">{formatDateTime(n.createdAt, ctx.tenant.timezone)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
