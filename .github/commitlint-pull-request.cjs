// A PR into dev is squashed into its title plus its description, so both are linted as that commit: no title is exempt, and a description keeps its long lines.
module.exports = {
  extends: ["../commitlint.config.cjs"],
  defaultIgnores: false,
  rules: {
    "body-max-line-length": [0],
    "footer-max-line-length": [0]
  }
};
