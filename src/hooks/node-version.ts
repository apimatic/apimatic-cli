import { Hook } from '@oclif/core';

// Kept in step with `engines.node` in package.json. npm and pnpm only warn when the
// installed Node is older, so without this the install succeeds and the failure surfaces
// later as an unrelated-looking crash.
export const MINIMUM_NODE_MAJOR = 24;

const hook: Hook.Init = async function () {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < MINIMUM_NODE_MAJOR) {
    this.error(
      `The APIMatic CLI needs Node ${MINIMUM_NODE_MAJOR} or newer; this is Node ${process.versions.node}. ` +
        'Upgrade Node from https://nodejs.org/en/download and reinstall the CLI.',
      { exit: 1 }
    );
  }
};

export default hook;
