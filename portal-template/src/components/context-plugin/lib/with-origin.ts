/** A command that already carries an absolute URL is left exactly as written. */
const HAS_URL = /https?:\/\//i;

/** Everything up to the final run of whitespace, then the last word. */
const LAST_WORD = /^([\s\S]*\s)(\S+)\s*$/;

/** Prefixes the command's last word with `origin`, unless it already holds a URL. */
export function withOrigin(command: string, origin: string | null): string {
  if (!origin || HAS_URL.test(command)) return command;

  const match = LAST_WORD.exec(command);
  if (!match) return command;

  const [, head, last] = match;
  return `${head}${origin.replace(/\/+$/, "")}/${last.replace(/^\/+/, "")}`;
}
