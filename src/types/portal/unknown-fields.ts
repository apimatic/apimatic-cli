/**
 * The errors for every field of a parsed settings document that the file does not define.
 *
 * A misspelled field is the one mistake that otherwise produces a portal that builds and is
 * quietly wrong, so each is reported, and a plausible misspelling is answered with the
 * field it meant. `renamed` is a Map rather than an object literal: `JSON.parse` happily
 * produces a document whose keys are `toString` or `constructor`, and indexing a literal with
 * those returns a prototype member, which would be printed back as the suggested spelling.
 *
 * @param describe the message for one unknown field, given the field it was taken to mean
 *   when `renamed` has it.
 */
export function unknownFieldErrors(
  data: Record<string, unknown>,
  known: ReadonlySet<string>,
  renamed: ReadonlyMap<string, string>,
  describe: (field: string, intended: string | undefined) => string
): string[] {
  return Object.keys(data)
    .filter((field) => !known.has(field))
    .map((field) => describe(field, renamed.get(field)));
}
