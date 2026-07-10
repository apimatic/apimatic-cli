module.exports = {
  // Three-tier release flow: alpha → beta → main.
  // - `main`  publishes stable releases to the npm `latest` dist-tag.
  // - `beta`  publishes prereleases to the `beta` dist-tag.
  // - `alpha` publishes prereleases to the `alpha` dist-tag.
  // The existing `v1.1.0-beta.*` git notes carry channels ["beta", null], so
  // `main` (default/`latest` channel) sees beta.19 as its last release and
  // graduates it to 1.1.0, while `beta` keeps its own counter — no notes
  // migration is needed. (Previously `beta` used `channel: false` to point
  // `latest` at the beta because no stable channel existed; `main` now owns it.)
  branches: [
    "main",
    {
      name: "beta",
      prerelease: true
    },
    {
      name: "alpha",
      prerelease: true
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
