import { err, ok, Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { ZipService } from '../infrastructure/zip-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';
import { CodeSampleCatalog, CodeSampleCatalogs } from './portal/code-samples.js';
import { PortalArtifacts, PortalArtifactsProblem } from './portal/portal-artifacts.js';
import { Language } from './sdk/generate.js';

/** The entries the portal artifacts zip is made of, as the endpoint lays them out. */
const ARTIFACTS_ZIP = {
  sdkDirectory: 'sdk',
  codeSamplesDirectory: 'code-samples',
  plugin: 'plugin.zip'
} as const;

/**
 * Turns the zip `/portal-artifacts` delivers into the artifacts a build reads. Everything in it is
 * optional: a portal that declares no languages and no plugin is a valid run that delivers an
 * empty zip.
 */
export class PortalArtifactsContext {
  private readonly fileService = new FileService();
  private readonly zipService = new ZipService();

  constructor(private readonly artifactsDirectory: DirectoryPath) {}

  private get archive(): FilePath {
    return new FilePath(this.artifactsDirectory, new FileName('portal-artifacts.zip'));
  }

  private get contents(): DirectoryPath {
    return this.artifactsDirectory.join('artifacts');
  }

  public async unpack(zip: NodeJS.ReadableStream): Promise<Result<PortalArtifacts, PortalArtifactsProblem>> {
    try {
      await this.fileService.writeFile(this.archive, zip);
      await this.fileService.createDirectoryIfNotExists(this.contents);
      await this.zipService.unArchive(this.archive, this.contents);
    } catch {
      return err({ kind: 'unreadableArchive' });
    }

    const codeSampleCatalogs = await this.codeSampleCatalogs();
    if (codeSampleCatalogs.isErr()) {
      return err(codeSampleCatalogs.error);
    }

    return ok(new PortalArtifacts(codeSampleCatalogs.value, await this.sdks(), await this.plugin()));
  }

  /**
   * Keyed by the delivered file's stem rather than parsed into `Language`, so a language the
   * server adds before this CLI models it is still placed rather than dropped.
   */
  private async sdks(): Promise<ReadonlyMap<string, FilePath>> {
    const directory = this.contents.join(ARTIFACTS_ZIP.sdkDirectory);
    if (!(await this.fileService.directoryExists(directory))) {
      return new Map();
    }

    const sdks = new Map<string, FilePath>();
    for (const fileName of await this.fileService.getFileNames(directory)) {
      const name = fileName.toString();
      if (name.endsWith('.zip')) {
        sdks.set(name.slice(0, -'.zip'.length), new FilePath(directory, fileName));
      }
    }
    return sdks;
  }

  /**
   * A catalog this CLI cannot read is an error rather than an omission: silently dropping one
   * would publish a portal missing the samples for a language the user asked for, and say nothing.
   */
  private async codeSampleCatalogs(): Promise<Result<CodeSampleCatalogs, PortalArtifactsProblem>> {
    const directory = this.contents.join(ARTIFACTS_ZIP.codeSamplesDirectory);
    if (!(await this.fileService.directoryExists(directory))) {
      return ok(new CodeSampleCatalogs([]));
    }

    const languages = Object.values(Language) as string[];
    const catalogs: CodeSampleCatalog[] = [];

    for (const fileName of await this.fileService.getFileNames(directory)) {
      const name = fileName.toString();
      if (!name.endsWith('.json')) {
        continue;
      }

      const language = name.slice(0, -'.json'.length);
      if (!languages.includes(language)) {
        return err({ kind: 'unreadableCatalog', language });
      }

      let json: unknown;
      try {
        json = JSON.parse(await this.fileService.getContents(new FilePath(directory, fileName)));
      } catch {
        return err({ kind: 'unreadableCatalog', language });
      }

      const catalog = CodeSampleCatalog.fromJson(language as Language, json);
      if (!catalog) {
        return err({ kind: 'unreadableCatalog', language });
      }
      catalogs.push(catalog);
    }

    return ok(new CodeSampleCatalogs(catalogs));
  }

  private async plugin(): Promise<FilePath | undefined> {
    const plugin = new FilePath(this.contents, new FileName(ARTIFACTS_ZIP.plugin));
    return (await this.fileService.fileExists(plugin)) ? plugin : undefined;
  }
}
