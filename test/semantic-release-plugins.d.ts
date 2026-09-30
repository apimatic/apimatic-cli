declare module '@semantic-release/commit-analyzer' {
  export function analyzeCommits(pluginConfig: object, context: object): Promise<string | null>;
}

declare module '@semantic-release/release-notes-generator' {
  export function generateNotes(pluginConfig: object, context: object): Promise<string>;
}
