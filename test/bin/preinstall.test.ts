import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'node:module';
import { expect } from 'chai';

const repositoryRoot = process.cwd();
const script = path.join(repositoryRoot, 'bin', 'preinstall.cjs');
const { nodeVersionOf, installingVersion, verdict } = createRequire(script)(script);
const { engines } = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));

const running = { execPath: '/usr/local/bin/node', version: '24.12.0' };
const notAsked = () => {
  throw new Error('asked a Node that is not the installer');
};

/** Runs a copy of the check as npm would, with no package manager naming its own Node. */
function install(scriptPath: string) {
  const env = { ...process.env };
  delete env.npm_node_execpath;
  delete env.npm_config_user_agent;
  return spawnSync(process.execPath, [scriptPath], { env, encoding: 'utf8' });
}

describe('preinstall Node check', () => {
  describe('the installing Node', () => {
    it('is the Node npm runs on, not the first one on PATH that runs the script', () => {
      const env = { npm_node_execpath: '/Users/me/.nvm/versions/node/v20.6.1/bin/node' };

      expect(installingVersion(env, running, () => '20.6.1')).to.equal('20.6.1');
    });

    it('is the running Node when the package manager names no other', () => {
      expect(installingVersion({}, running, notAsked)).to.equal('24.12.0');
      expect(installingVersion({ npm_node_execpath: running.execPath }, running, notAsked)).to.equal('24.12.0');
    });

    it('is the running Node when the package manager names its own executable, as pnpm does', () => {
      const env = { npm_node_execpath: 'C:\\Users\\me\\AppData\\Local\\pnpm\\pnpm.exe' };

      expect(installingVersion(env, running, notAsked)).to.equal('24.12.0');
    });

    it('is the running Node when the named Node cannot report its version', () => {
      const env = { npm_node_execpath: 'C:\\Program Files\\nodejs\\node.exe' };
      const fails = () => {
        throw new Error('spawn ENOENT');
      };

      expect(installingVersion(env, running, fails)).to.equal('24.12.0');
      expect(installingVersion(env, running, () => 'Welcome to Node.js')).to.equal('24.12.0');
    });

    it('is read from the named Node by running it', () => {
      expect(nodeVersionOf(process.execPath)).to.equal(process.versions.node);
    });
  });

  describe('the verdict', () => {
    it('refuses a Node below the floor and names the floor to switch to', () => {
      const result = verdict('>=24.5.0', '24.4.1');

      expect(result.refused).to.be.true;
      expect(result.message).to.contain('24.4.1').and.contain('Node 24.5.0 or later').and.contain('nvm install 24');
    });

    it('compares versions by number, not text', () => {
      expect(verdict('>=24.5.0', '24.10.0').refused).to.be.false;
      expect(verdict('>=24.5.0', '23.99.99').refused).to.be.true;
    });

    it('accepts the floor itself, however it is written', () => {
      for (const range of ['>=24', '>=24.0', '>= 24.0.0']) {
        expect(verdict(range, '24.0.0').refused, range).to.be.false;
        expect(verdict(range, '23.11.0').refused, range).to.be.true;
      }
    });

    it('leaves a range other than a plain floor to the init hook', () => {
      for (const range of ['^24.0.0 || >=26.0.0', '>=24.0.0 <27.0.0', undefined]) {
        expect(verdict(range, '20.6.1').refused, String(range)).to.be.false;
      }
    });

    it("reads this package's own range as a floor it enforces", () => {
      expect(verdict(engines.node, '20.6.1').refused).to.be.true;
    });
  });

  describe('as a preinstall script', () => {
    let root: string;
    let scriptCopy: string;

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'preinstall-'));
      fs.mkdirSync(path.join(root, 'bin'));
      scriptCopy = path.join(root, 'bin', 'preinstall.cjs');
      fs.copyFileSync(script, scriptCopy);
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ engines: { node: '>=999.0.0' } }));
    });

    afterEach(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    it('fails the install with the reason when the Node below the floor is the one running it', () => {
      const result = install(scriptCopy);

      expect(result.status).to.equal(1);
      expect(result.stderr).to.contain('>=999.0.0').and.contain(process.versions.node);
    });

    it("lets the install through on a Node inside this package's range", () => {
      expect(install(script).status).to.equal(0);
    });
  });
});
