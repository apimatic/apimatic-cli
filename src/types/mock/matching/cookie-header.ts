/**
 * Reads Cookie headers (`name=value; other=value`) into values per name in the order sent. A name
 * sent twice keeps both values, as a query key does, so a rule that expects one value sees the
 * second instead of passing on the first. A fragment without a name or without `=` names no cookie.
 */
export function parseCookies(headerValues: readonly string[]): Map<string, string[]> {
  const cookies = new Map<string, string[]>();
  for (const fragment of headerValues.flatMap((value) => value.split(';'))) {
    const equals = fragment.indexOf('=');
    const name = fragment.slice(0, Math.max(equals, 0)).trim();
    if (name.length > 0) {
      cookies.set(name, [...(cookies.get(name) ?? []), fragment.slice(equals + 1).trim()]);
    }
  }
  return cookies;
}
