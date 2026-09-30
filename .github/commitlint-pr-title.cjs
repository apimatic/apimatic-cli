// A PR title becomes a squash commit's header, so none is exempt: GitHub's `Revert "…"` or `Merge …` would release nothing.
module.exports = {
  extends: ["../commitlint.config.cjs"],
  defaultIgnores: false
};
