export const removeQuotes = (input: string): string => {
  const quotes = ['"', "'"];

  for (const quote of quotes) {
    if (input.startsWith(quote) && input.endsWith(quote) && input.length > 1) {
      return removeQuotes(input.slice(1, -1)); // Recursive call
    }
  }
  return input;
};

// Editors on Windows, and PowerShell redirection, write a byte-order mark. `JSON.parse`
// rejects it while the YAML parser strips it, so without this the same document is accepted
// as `.yaml` and refused as `.json`.
export function stripByteOrderMark(contents: string): string {
  return contents.codePointAt(0) === 0xfeff ? contents.slice(1) : contents;
}

const PROSE_LISTS = {
  and: new Intl.ListFormat('en-GB', { type: 'conjunction' }),
  or: new Intl.ListFormat('en-GB', { type: 'disjunction' })
};

/** The items as a sentence lists them: `a`, `a and b`, `a, b and c`, or with `or` when they are choices. */
export function listedInProse(items: readonly string[], joiner: keyof typeof PROSE_LISTS = 'and'): string {
  return PROSE_LISTS[joiner].format(items);
}
