const { execFileSync } = require('node:child_process');
const path = require('node:path');

function nodeVersionOf(executable) {
  return execFileSync(executable, ['-p', 'process.versions.node'], { encoding: 'utf8', timeout: 10000 }).trim();
}

// npm runs scripts on the first `node` on PATH but names its own Node in npm_node_execpath; pnpm names itself there.
function installingVersion(env, running, versionOf) {
  const installer = env.npm_node_execpath;
  if (!installer || installer === running.execPath || !/^node(\.exe)?$/i.test(path.basename(installer))) {
    return running.version;
  }
  try {
    const reported = versionOf(installer);
    return /^\d+\.\d+\.\d+$/.test(reported) ? reported : running.version;
  } catch {
    return running.version;
  }
}

// A range other than a plain floor is left to the init hook, which reads it with semver.
function verdict(range, version) {
  const floor = /^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(range || '');
  if (floor === null) {
    return { refused: false };
  }
  const minimum = floor.slice(1).map((part) => Number(part || 0));
  const installing = version.split('.').map(Number);
  const differing = installing.findIndex((part, i) => part !== minimum[i]);
  if (differing === -1 || installing[differing] > minimum[differing]) {
    return { refused: false };
  }
  return {
    refused: true,
    message:
      `The APIMatic CLI needs Node ${range}, but it is being installed with Node ${version}. ` +
      `Switch to Node ${minimum.join('.')} or later (for example \`nvm install ${minimum[0]}\`, or download it from ` +
      'https://nodejs.org/en/download) and run the install again.'
  };
}

if (require.main === module) {
  const { engines } = require('../package.json');
  const running = { execPath: process.execPath, version: process.versions.node };
  const result = verdict(engines?.node, installingVersion(process.env, running, nodeVersionOf));
  if (result.refused) {
    console.error(result.message);
    process.exitCode = 1;
  }
}

module.exports = { nodeVersionOf, installingVersion, verdict };
