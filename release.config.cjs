// eslint-disable-next-line no-undef
module.exports = {
  branches: [
    "v3",
    {
      name: "alpha",
      prerelease: true
    },
    {
      name: "beta",
      prerelease: true,
      // Publish beta releases to the npm `latest` dist-tag (the default channel)
      // rather than a `beta` dist-tag, so `npm install @apimatic/cli` resolves to
      // the current beta. The dist-tag is applied during `npm publish`, so this
      // works with OIDC trusted publishing (no NPM_TOKEN needed).
      // NOTE: existing beta tags' git notes were migrated to include the default
      // channel so version continuity is preserved (beta.N keeps incrementing).
      channel: false
    }
  ],
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    [
      "@semantic-release/changelog",
      {
        changelogFile: "CHANGELOG.md"
      }
    ],
    "@semantic-release/npm",
    "@semantic-release/github",
    [
      "@semantic-release/git",
      {
        assets: ["CHANGELOG.md", "package.json"],
        message:
          "chore(release): set `package.json` to ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
      }
    ]
  ]
};
