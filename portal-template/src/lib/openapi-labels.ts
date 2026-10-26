interface DocumentedItems {
  operations?: { method: string; path: string }[];
  webhooks?: { method: string; name: string }[];
}

/**
 * The operations and webhooks a reference page documents, as a spec's author names them:
 * `METHOD path`, and `METHOD name (webhook)`. `format` wraps the method and path or name.
 */
export function operationLabels(page: DocumentedItems, format: (signature: string) => string = (s) => s): string[] {
  return [
    ...(page.operations ?? []).map(({ method, path }) => format(`${method.toUpperCase()} ${path}`)),
    ...(page.webhooks ?? []).map(({ method, name }) => `${format(`${method.toUpperCase()} ${name}`)} (webhook)`)
  ];
}
