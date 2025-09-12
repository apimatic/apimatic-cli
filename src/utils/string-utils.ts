export const removeQuotes = (input: string): string => {
  const quotes = ['"', "'"];

  for (const quote of quotes) {
    if (input.startsWith(quote) && input.endsWith(quote) && input.length > 1) {
      return removeQuotes(input.slice(1, -1)); // Recursive call
    }
  }
  return input;
};


export function wrapToColumns(input: string, maxWidth: number): string[] {
  const inputRows = input.split('\n');
  return inputRows.flatMap((textLine: string): string[] => {
    if (textLine.length <= maxWidth) {
      return [textLine];
    }
    // Find last space before width limit for natural word breaking
    let breakPosition: number = textLine.substring(0, maxWidth + 1).lastIndexOf(" ");
    // If no space found, force break at width limit
    if (breakPosition === -1) {
      breakPosition = maxWidth;
    }
    const wrappedLine: string = textLine.substring(0, breakPosition);
    const remainingText: string = textLine.substring(breakPosition + 1);
    return [wrappedLine, ...wrapToColumns(remainingText, maxWidth)];
  });
}
