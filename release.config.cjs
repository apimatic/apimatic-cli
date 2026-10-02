// A squash commit's body is its PR description; only the header may decide a version or a notes line.
const headerOnly = { noteKeywords: null, issuePrefixes: null, fieldPattern: null };

module.exports = {
  branches: [
    // Cut from v1.5.0 only when a 1.x fix is needed (.ai/plans/release-pipeline.md, 7.6).
    "1.x",
    "main",
    {
      name: "beta",
      prerelease: true
    }
  ],
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
        parserOpts: headerOnly,
        // A revert squash lacks git's "This reverts commit" line; a matched custom rule skips the defaults, hence breaking first.
        releaseRules: [
          { breaking: true, release: "major" },
          { type: "revert", release: "patch" }
        ]
      }
    ],
    ["@semantic-release/release-notes-generator", { preset: "conventionalcommits", parserOpts: headerOnly }],
    "@semantic-release/npm",
    "@semantic-release/github"
  ]
};
