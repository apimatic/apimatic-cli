/**
 * The errors for every field of a parsed settings document that the file does not define.
 *
 * A misspelled field is the one mistake that otherwise produces a portal that builds and is
 * quietly wrong, so each is reported.
 *
 * @param describe the message for one unknown field.
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
