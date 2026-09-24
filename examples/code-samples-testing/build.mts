import fs from 'node:fs';
import path from 'node:path';
import { PortalBuildService } from '../../src/infrastructure/portal-build-service.ts';
import { PortalProjectService } from '../../src/infrastructure/portal-project-service.ts';
import { ensureBuildDirectoryBase } from '../../src/infrastructure/tmp-extensions.ts';
import { DirectoryPath } from '../../src/types/file/directoryPath.ts';
import { PortalContext } from '../../src/types/portal-context.ts';
import { PortalSourceContext } from '../../src/types/portal-source-context.ts';
import { CodeSampleCatalog, CodeSamples } from '../../src/types/portal/code-samples.ts';
import type { Language } from '../../src/types/sdk/generate.ts';

const [caseDirectory, outputDirectory] = process.argv.slice(2).map((argument) => path.resolve(argument));
const fixture = new DirectoryPath(path.join(caseDirectory, 'src'));

const entries: [Language, unknown][] = JSON.parse(fs.readFileSync(path.join(caseDirectory, 'catalogs.json'), 'utf8'));
const catalogs = entries.map(([language, json]) => CodeSampleCatalog.fromJson(language, json));
if (catalogs.some((catalog) => catalog === undefined)) throw new Error('catalogs.json holds a catalog the CLI rejects');
const codeSamples = new CodeSamples(catalogs as CodeSampleCatalog[]);

const source = (await new PortalSourceContext(fixture).resolve())._unsafeUnwrap();
console.log(
  'specs:',
  source.specs.map((spec) => `${spec.file.name()}`)
);
console.log('unplaced:', codeSamples.unplacedIn(source.specs.map((spec) => spec.document)));

const base = await ensureBuildDirectoryBase(fixture);
const root = fs.mkdtempSync(path.join(base, 'code-samples-'));
try {
  const project = new DirectoryPath(root).join('build');
  fs.mkdirSync(`${project}`, { recursive: true });
  const service = new PortalProjectService();
  const sampled = await service.addCodeSamples(project, source, codeSamples);
  console.log('unsampled:', sampled.unsampledSpecs.map(String));

  const prepared = (await service.prepare(project, sampled.source))._unsafeUnwrap();
  const build = await new PortalBuildService().build(prepared);
  if (build.isErr()) throw new Error(`${build.error.message}\n${build.error.log.split('\n').slice(-30).join('\n')}`);

  fs.rmSync(outputDirectory, { recursive: true, force: true });
  (await new PortalContext(new DirectoryPath(outputDirectory)).save(build.value.output, false))._unsafeUnwrap();
  console.log(`pages: ${build.value.pageCount}, written to ${outputDirectory}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
