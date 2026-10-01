import { Hook } from '@oclif/core';
import semver from 'semver';

// `bin/preinstall.cjs` only stops npm installs, and Node can be switched after installing, so
// without this an unsupported Node surfaces later as an unrelated-looking crash.
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
