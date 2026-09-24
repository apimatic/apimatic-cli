/**
 * A misspelled field is the one mistake that otherwise produces a portal that builds and is
 * quietly wrong, so each is reported.
 */
export function unknownFieldErrors(
  data: Record<string, unknown>,
  known: ReadonlySet<string>,
  describe: (field: string) => string
): string[] {
  return Object.keys(data)
    .filter((field) => !known.has(field))
    .map(describe);
}
