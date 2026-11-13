"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { letterTemplates } from "@/db/schema";
import { type ActionState, run } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { UserError } from "@/lib/errors";
import { requireAction, tenantTx } from "@/lib/session";

const templateSchema = z.object({
  name: z.string().trim().min(2, "Enter a template name.").max(120),
  body: z.string().trim().min(10, "The letter body is too short.").max(20000),
});

export async function saveTemplateAction(id: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAction("letters.manage");
    const data = templateSchema.parse({ name: fd.get("name"), body: fd.get("body") });
    await tenantTx(ctx, async (tx) => {
      const actor = { tenantId: ctx.tenant.id, userId: ctx.user.id, ip: ctx.ip };
      if (id) {
        const [before] = await tx.select().from(letterTemplates).where(eq(letterTemplates.id, id));
        if (!before) throw new UserError("Template not found.");
        await tx.update(letterTemplates).set({ ...data, updatedAt: new Date() }).where(eq(letterTemplates.id, id));
        await audit(tx, actor, { action: "letter_template.updated", entityType: "letter_template", entityId: id, before: { name: before.name }, after: { name: data.name } });
      } else {
        const key = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "letter";
        const [t] = await tx.insert(letterTemplates).values({ tenantId: ctx.tenant.id, key, ...data }).returning({ id: letterTemplates.id });
        await audit(tx, actor, { action: "letter_template.created", entityType: "letter_template", entityId: t.id, after: { key, name: data.name } });
      }
    });
    revalidatePath("/app/letters");
    return "Template saved.";
  });
}
