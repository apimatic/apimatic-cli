const { engines } = require('../package.json');

// Scripts run on the first `node` on PATH, which need not be the Node npm is installing with.
const installer = /\bnode\/v(\d+\.\d+\.\d+)/.exec(process.env.npm_config_user_agent || '');
const installing = installer ? installer[1] : process.versions.node;
const required = /^>=(\d+\.\d+\.\d+)$/.exec(engines.node)[1];
const requiredMajor = required.split('.')[0];

function isOlder(version, floor) {
  const [have, need] = [version, floor].map((v) => v.split('.').map(Number));
  const differing = have.findIndex((part, i) => part !== need[i]);
  return differing !== -1 && have[differing] < need[differing];
}

if (isOlder(installing, required)) {
  console.error(
    `The APIMatic CLI needs Node ${engines.node}, but it is being installed with Node ${installing}. ` +
      `Switch to Node ${requiredMajor} or later (for example \`nvm use ${requiredMajor}\`, or install it from ` +
      'https://nodejs.org/en/download) and run the install again.'
  );
  process.exitCode = 1;
}
