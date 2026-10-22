import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { reportSharedEndpoints, reportUnplacedSamples } from '../../../src/prompts/portal/code-samples.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { FileName } from '../../../src/types/file/fileName.js';
import { FilePath } from '../../../src/types/file/filePath.js';
import { Endpoint } from '../../../src/types/portal/endpoint.js';

const source = new DirectoryPath('project').join('src');
const files = ['alpha', 'beta'].map(
  (folder) => new FilePath(source.join('spec').join(folder), new FileName('openapi.json'))
);

describe('the code samples prompts', () => {
  let lines: string[];

  beforeEach(() => {
    lines = [];
    const record = (text?: string | string[]) => {
      lines.push(stripVTControlCharacters(String(text)));
    };
    sinon.stub(log, 'warn').callsFake(record);
    sinon.stub(log, 'message').callsFake(record);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('reportSharedEndpoints', () => {
    it('says nothing when no two specs declare the same operation', () => {
      reportSharedEndpoints([], source);

      expect(lines).to.deep.equal([]);
    });

    it('names each operation and the specs declaring it, and why it shows no SDK sample', () => {
      reportSharedEndpoints(
        [
          { key: new Endpoint('get', '/status'), files },
          { key: new Endpoint('post', '/status'), files }
        ],
        source
      );

      expect(lines.join('\n').split('\n')).to.deep.equal([
        'More than one API definition declares these operations, so the portal shows no SDK sample on them:',
        "  • 'GET /status': 'spec/alpha/openapi.json' and 'spec/beta/openapi.json'",
        "  • 'POST /status': 'spec/alpha/openapi.json' and 'spec/beta/openapi.json'"
      ]);
    });

    it('speaks of one operation when there is one', () => {
      reportSharedEndpoints([{ key: new Endpoint('get', '/status'), files }], source);

      expect(lines[0]).to.contain('declares this operation,');
      expect(lines[0]).to.contain('no SDK sample on it:');
    });
  });

  describe('reportUnplacedSamples', () => {
    it('says nothing when every sample has an operation', () => {
      reportUnplacedSamples([], source);

      expect(lines).to.deep.equal([]);
    });

    it('names the spec of the samples filed by spec, and spec/ for the others', () => {
      reportUnplacedSamples(
        [
          { spec: files[0], endpoints: [new Endpoint('get', '/refunds'), new Endpoint('post', '/refunds')] },
          { spec: null, endpoints: [new Endpoint('get', '/owners')] }
        ],
        source
      );

      expect(lines).to.deep.equal([
        "No operation in 'spec/alpha/openapi.json' takes the code samples for GET /refunds, POST /refunds.",
        "No operation in 'spec' takes the code samples for GET /owners."
      ]);
    });
  });
});
