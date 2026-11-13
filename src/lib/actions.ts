import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { UserError } from "./errors";
import { log } from "./log";

export type ActionState = { ok?: string; error?: string } | null;

type PgLike = { code?: string; message?: string; constraint_name?: string };

function pgError(err: unknown): PgLike | null {
  let e: unknown = err;
  for (let i = 0; i < 4 && e; i++) {
    if (typeof e === "object" && e && "code" in e && typeof (e as PgLike).code === "string") return e as PgLike;
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}

/** Turns any thrown error into a message that is safe to show a user. */
export function userMessage(err: unknown): string {
  if (err instanceof ZodError) return err.issues[0]?.message ?? "Please check the form.";
  const pg = pgError(err);
  if (pg) {
    switch (pg.code) {
      case "23505":
        return "That value is already in use.";
      case "23503":
        return pg.message?.startsWith("cross-tenant") ? "That record is not available." : "This record is linked to other records.";
      case "42501":
      case "55000":
        return pg.message ?? "Not allowed.";
      case "22P02":
        return "Invalid value.";
    }
  }
  if (err instanceof UserError) return err.message;
  log.error("action failed", { error: String(err), stack: err instanceof Error ? err.stack : undefined });
  return "Something went wrong. Please try again.";
}

/** Wraps a server action body: success message or a friendly error. */
export async function run(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const ok = await fn();
    return { ok: ok ?? "Saved." };
  } catch (err) {
    unstable_rethrow(err); // let redirect()/notFound() through
    return { error: userMessage(err) };
  }
}

export function formString(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function formOptional(fd: FormData, key: string): string | null {
  const v = formString(fd, key);
  return v === "" ? null : v;
}
