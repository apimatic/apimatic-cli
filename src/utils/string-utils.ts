export const removeQuotes = (path: string): string => {
  const quotes = ['"', "'"];

  for (const quote of quotes) {
    if (path.startsWith(quote) && path.endsWith(quote) && path.length > 1) {
      return removeQuotes(path.slice(1, -1)); // Recursive call
    }
  }
  return path;
};
