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
 * @param renamed plausible misspellings mapped to the field each one means; a file with no
 *   such list leaves it out and `describe` is never given an intended field.
 */
export function unknownFieldErrors(
  data: Record<string, unknown>,
  known: ReadonlySet<string>,
  describe: (field: string, intended: string | undefined) => string,
  renamed: ReadonlyMap<string, string> = new Map()
): string[] {
  return Object.keys(data)
    .filter((field) => !known.has(field))
    .map((field) => describe(field, renamed.get(field)));
}
