/** Edit distance, counted in UTF-16 code units: it ranks which stub's path a mistyped path is closest to. */
export function levenshtein(first: string, second: string): number {
  let previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let i = 1; i <= first.length; i++) {
    const current = [i];
    for (let j = 1; j <= second.length; j++) {
      const substitution = previous[j - 1] + (first[i - 1] === second[j - 1] ? 0 : 1);
      current.push(Math.min(previous[j] + 1, current[j - 1] + 1, substitution));
    }
    previous = current;
  }
  return previous[second.length];
}
