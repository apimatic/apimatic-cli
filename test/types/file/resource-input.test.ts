import path from 'node:path';
import { expect } from 'chai';
import { FilePath } from '../../../src/types/file/filePath';
import { createResourceInput } from '../../../src/types/file/resource-input';
import { UrlPath } from '../../../src/types/file/urlPath';
import { ProjectContext } from '../../../src/types/project-context';

describe('createResourceInput', () => {
  const sourceOf = (spec: unknown) => (spec as ProjectContext).sourceDirectory().toString();

  it('takes the spec in the project at --input when neither --file nor --url is given', () => {
    const spec = createResourceInput(undefined, undefined, 'project');

    expect(spec).to.be.instanceOf(ProjectContext);
    expect(sourceOf(spec)).to.equal(path.resolve('project', 'src'));
  });

  it('takes the project too when --file or --url is given empty, as an unset shell variable gives it', () => {
    expect(sourceOf(createResourceInput('', undefined, 'project'))).to.equal(path.resolve('project', 'src'));
    expect(sourceOf(createResourceInput(undefined, '', 'project'))).to.equal(path.resolve('project', 'src'));
  });

  it('takes --file as a file on disk and --url as an address', () => {
    expect(createResourceInput('specs/openapi.json', undefined, 'project')).to.be.instanceOf(FilePath);
    expect(createResourceInput(undefined, 'https://example.org/openapi.json', 'project')).to.be.instanceOf(UrlPath);
  });
});
