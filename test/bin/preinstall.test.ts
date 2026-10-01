import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { expect } from 'chai';

const repositoryRoot = process.cwd();
const script = path.join(repositoryRoot, 'bin', 'preinstall.cjs');
const { engines } = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
const floor: string = engines.node.replace('>=', '');

const npmOn = (nodeVersion: string) => `npm/10.9.0 node/v${nodeVersion} darwin arm64 workspaces/false`;

/** Runs the check as npm would, with `userAgent` naming the Node npm is installing with. */
function install(userAgent: string | null, scriptPath = script) {
  const env = { ...process.env };
  delete env.npm_config_user_agent;
  if (userAgent !== null) {
    env.npm_config_user_agent = userAgent;
  }
  return spawnSync(process.execPath, [scriptPath], { env, encoding: 'utf8' });
}

describe('preinstall Node check', () => {
  it('turns away an install by an older Node, though the script itself runs on a supported one', () => {
    const result = install(npmOn('20.6.1'));

    expect(result.status).to.equal(1);
    expect(result.stderr).to.contain(engines.node).and.contain('20.6.1');
  });

  it('lets an install by the oldest supported Node through', () => {
    expect(install(npmOn(floor)).status).to.equal(0);
  });

  it('judges the Node running the script when no package manager names one', () => {
    expect(install(null).status).to.equal(0);
  });

  describe('against a floor with a minor version', () => {
    let root: string;
    let scriptCopy: string;

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'preinstall-'));
      fs.mkdirSync(path.join(root, 'bin'));
      scriptCopy = path.join(root, 'bin', 'preinstall.cjs');
      fs.copyFileSync(script, scriptCopy);
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ engines: { node: '>=24.5.0' } }));
    });

    afterEach(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    it('compares versions by number, not text', () => {
      expect(install(npmOn('24.4.1'), scriptCopy).status).to.equal(1);
      expect(install(npmOn('24.10.0'), scriptCopy).status).to.equal(0);
    });
  });
});
