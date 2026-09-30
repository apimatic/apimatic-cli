module.exports = {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        // The release reads only a commit's header, so a BREAKING CHANGE footer alone would ship as a minor or a patch.
        "breaking-change-in-header": ({ header, notes }) => [
          notes.length === 0 || /^\w+(\([^)]*\))?!:/.test(header ?? ""),
          "mark a breaking change with ! in the header, as in feat(sdk)!: …; a BREAKING CHANGE footer alone is ignored"
        ]
      }
    }
  ],
  rules: {
    "breaking-change-in-header": [2, "always"]
  }
};
