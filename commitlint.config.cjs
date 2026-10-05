module.exports = {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        // The release reads only a commit's header, so a BREAKING CHANGE footer alone would ship as a minor or a patch.
        "breaking-change-in-header": ({ header, notes }) => {
          const hasBreakingNote = notes.some((note) => /^BREAKING[ -]CHANGE$/i.test(note.title));
          const headerHasBang = /^\w+(\([^)]*\))?!:/.test(header ?? "");
          return [
            !hasBreakingNote || headerHasBang,
            "a BREAKING CHANGE note needs ! in the header, as in feat(sdk)!: …, because the release ignores notes; a line such as 'Breaking change: none' counts as one, so drop it"
          ];
        }
      }
    }
  ],
  rules: {
    "breaking-change-in-header": [2, "always"]
  }
};
