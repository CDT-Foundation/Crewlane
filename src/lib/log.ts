/** Minimal structured JSON logger (one line per event, stdout/stderr). */
type Fields = Record<string, unknown>;

function write(level: "debug" | "info" | "warn" | "error", msg: string, fields?: Fields) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, fields?: Fields) => {
    if (process.env.LOG_LEVEL === "debug") write("debug", msg, fields);
  },
  info: (msg: string, fields?: Fields) => write("info", msg, fields),
  warn: (msg: string, fields?: Fields) => write("warn", msg, fields),
  error: (msg: string, fields?: Fields) => write("error", msg, fields),
};
