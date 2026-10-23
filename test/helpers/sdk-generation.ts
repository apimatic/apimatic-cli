import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { ok } from 'neverthrow';
import sinon from 'sinon';
import { SdkGenerationService } from '../../src/infrastructure/services/sdk-generation-service.js';
import { ZipService } from '../../src/infrastructure/zip-service.js';
import { SdkGeneratePrompts } from '../../src/prompts/sdk/generate.js';
import { DirectoryPath } from '../../src/types/file/directoryPath.js';
import { FileName } from '../../src/types/file/fileName.js';
import { FilePath } from '../../src/types/file/filePath.js';

export type Files = Record<string, string>;

export function writeFiles(directory: string, files: Files): void {
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(directory, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
}

/**
 * A project with a spec at `root`, and a generation service that answers with a zip of whatever
 * `generates` was last given. The stubs last until `sinon.restore()`.
 */
export function stubSdkGeneration(root: string): {
  generates: (files: Files) => Promise<void>;
  generateSdk: sinon.SinonStub;
} {
  writeFiles(root, { 'src/spec/openapi.json': '{}' });
  sinon.stub(SdkGeneratePrompts.prototype, 'generateSdk').callsFake((fn) => fn);
  const generateSdk = sinon.stub(SdkGenerationService.prototype, 'generateSdk');
  return {
    generateSdk,
    generates: async (files) => {
      const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-generated-'));
      try {
        writeFiles(path.join(scratch, 'sdk'), files);
        const archive = new FilePath(new DirectoryPath(scratch), new FileName('sdk.zip'));
        (await new ZipService().archive(new DirectoryPath(path.join(scratch, 'sdk')), archive))._unsafeUnwrap();
        const bytes = fs.readFileSync(archive.toString());
        generateSdk.callsFake(() => Promise.resolve(ok(Readable.from([bytes]))));
      } finally {
        fs.rmSync(scratch, { recursive: true, force: true });
      }
    }
  };
}
