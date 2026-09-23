import { Hook } from '@oclif/core';
import semver from 'semver';

// npm and pnpm only warn when the installed Node falls outside `engines.node`, so without
// this the install succeeds and the failure surfaces later as an unrelated-looking crash.
const hook: Hook.Init = async function () {
  const supported = this.config.pjson.engines?.node;
  if (supported !== undefined && !semver.satisfies(process.versions.node, supported)) {
    this.error(
      `The APIMatic CLI needs Node ${supported}; this is Node ${process.versions.node}. ` +
        'Upgrade Node from https://nodejs.org/en/download and reinstall the CLI.',
      { exit: 1 }
    );
  }
};

export default hook;
