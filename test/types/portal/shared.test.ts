import { expect } from 'chai';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FileName } from '../../../src/types/file/fileName';
import { FilePath } from '../../../src/types/file/filePath';
import { Endpoint } from '../../../src/types/portal/endpoint';
import { shared } from '../../../src/types/portal/shared';

describe('shared', () => {
  const spec = new DirectoryPath('project').join('src', 'spec');
  const alpha = new FilePath(spec.join('alpha'), new FileName('openapi.json'));
  const beta = new FilePath(spec.join('beta'), new FileName('openapi.json'));
  const named = (claims: ReturnType<typeof shared<Endpoint>>) =>
    claims.map(({ key, files }) => [String(key), files.map((file) => file.toString())]);

  it('gives each key more than one file claims, with its files, in the order first claimed', () => {
    const claims = shared([
      { key: new Endpoint('get', '/beta'), file: beta },
      { key: new Endpoint('get', '/status'), file: alpha },
      { key: new Endpoint('get', '/alpha'), file: alpha },
      { key: new Endpoint('GET', '/status'), file: beta }
    ]);

    expect(named(claims)).to.deep.equal([['GET /status', [alpha.toString(), beta.toString()]]]);
  });
});
