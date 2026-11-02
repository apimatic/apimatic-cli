import { Hook } from '@oclif/core';

const v2NodeMajor = 24;
const installV2 = 'npm install -g @apimatic/cli@2';

const upgradeSteps = (nodeVersion: string): string[] => {
  const nodeMajor = Number(nodeVersion.split('.')[0]);
  if (nodeMajor >= v2NodeMajor) return [`  ${installV2}`];
  return [
    `  1. Upgrade Node.js from ${nodeVersion} to ${v2NodeMajor} or newer:`,
    '     https://nodejs.org/en/download',
    `  2. ${installV2}`
  ];
};

export const upgradeNotice = (nodeVersion: string): string =>
  [
    "You're using an older version of the APIMatic CLI (v1).",
    'A newer version, CLI v2, is available. To upgrade:',
    ...upgradeSteps(nodeVersion),
    "What's new in v4 SDKs, Context Plugins and the Developer Portal:",
    'https://docs.apimatic.io/v4/whats-new-in-v4'
  ].join('\n');

const hook: Hook.Init = async function () {
  this.warn(upgradeNotice(process.versions.node));
};

export default hook;
