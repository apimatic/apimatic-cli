import { err, ok, Result } from 'neverthrow';
import { parse as parseYaml } from 'yaml';
import { FileService } from '../infrastructure/file-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';
import { PortalConfig } from './portal/portal-config.js';
import { PortalMigration, PortalSource, PortalSourceProblem, PortalSpec } from './portal/portal-source.js';

const SPEC_EXTENSIONS = ['.json', '.yaml', '.yml'];

// `/api/search` is the portal's own search index. A spec whose name slugs to `search`
// would make the build write a file where that route's directory already stands, failing
// with an unexplained EISDIR. Claiming the name here sends such a spec to `search-2`.
const RESERVED_SPEC_SLUGS = ['search'];

// `generatePortal` settings the v1 `portal.json` can express; everything else in the old
// build file is reported as unsupported by the migration hint.
const MIGRATABLE_PORTAL_FIELDS = new Set(['pageTitle', 'logoUrl']);

/**
 * The `src/` directory of a portal project: `portal.json`, the OpenAPI documents in
 * `spec/`, and the optional `content/` and `static/` directories.
 */
export class PortalSourceContext {
  private readonly fileService = new FileService();

  constructor(private readonly sourceDirectory: DirectoryPath) {}

  private get configFile(): FilePath {
    return new FilePath(this.sourceDirectory, new FileName('portal.json'));
  }

  private get legacyBuildFile(): FilePath {
    return new FilePath(this.sourceDirectory, new FileName('APIMATIC-BUILD.json'));
  }

  private get specDirectory(): DirectoryPath {
    return this.sourceDirectory.join('spec');
  }

  private get contentDirectory(): DirectoryPath {
    return this.sourceDirectory.join('content');
  }

  private get staticDirectory(): DirectoryPath {
    return this.sourceDirectory.join('static');
  }

  /** Reads and validates the whole source directory, or reports the first problem found. */
  public async resolve(): Promise<Result<PortalSource, PortalSourceProblem>> {
    if (!(await this.fileService.fileExists(this.configFile))) {
      return err({ kind: 'missingConfig', migration: await this.migration() });
    }

    const config = PortalConfig.parse(await this.fileService.getContents(this.configFile));
    if (config.isErr()) {
      return err({ kind: 'invalidConfig', errors: config.error });
    }

    const specs = await this.specs();
    if (specs.isErr()) {
      return err(specs.error);
    }

    return ok({
      config: config.value,
      specs: specs.value,
      contentDirectory: (await this.fileService.directoryExists(this.contentDirectory)) ? this.contentDirectory : null,
      staticDirectory: (await this.fileService.directoryExists(this.staticDirectory)) ? this.staticDirectory : null
    });
  }

  private async specs(): Promise<Result<PortalSpec[], PortalSourceProblem>> {
    const specs: PortalSpec[] = [];
    const usedSlugs = new Set<string>(RESERVED_SPEC_SLUGS);

    for (const fileName of await this.specFileNames()) {
      const file = new FilePath(this.specDirectory, fileName);
      const document = await this.readDocument(file);
      if (document === undefined) {
        return err({ kind: 'unreadableSpec', fileName });
      }

      const format = this.specFormat(document);
      if (!format.supported) {
        if (format.format === null) {
          continue;
        }
        return err({ kind: 'unsupportedSpec', fileName, format: format.format });
      }

      specs.push({ slug: this.uniqueSlug(fileName, usedSlugs), file });
    }

    if (specs.length === 0) {
      return err({ kind: 'noSpecs' });
    }
    return ok(specs);
  }

  private async specFileNames(): Promise<FileName[]> {
    if (!(await this.fileService.directoryExists(this.specDirectory))) {
      return [];
    }
    const directory = await this.fileService.getDirectory(this.specDirectory);
    return directory.items
      .flatMap((item) => ('fileName' in item ? [item.fileName] : []))
      .filter((fileName) => SPEC_EXTENSIONS.some((extension) => fileName.toString().toLowerCase().endsWith(extension)))
      .sort((left, right) => left.toString().localeCompare(right.toString()));
  }

  private async readDocument(file: FilePath): Promise<Record<string, unknown> | undefined> {
    try {
      const contents = await this.fileService.getContents(file);
      // JSON is valid YAML, but the YAML parser is far slower and specs run to megabytes,
      // so each extension gets the parser built for it.
      const document = file.toString().toLowerCase().endsWith('.json') ? JSON.parse(contents) : parseYaml(contents);
      return typeof document === 'object' && document !== null && !Array.isArray(document)
        ? (document as Record<string, unknown>)
        : {};
    } catch {
      return undefined;
    }
  }

  // A document without a version key is not a spec at all (APIMATIC-META.json, a `$ref`
  // target); those are skipped silently. A recognisable but unsupported format is named.
  private specFormat(
    document: Record<string, unknown>
  ): { supported: true } | { supported: false; format: string | null } {
    const openapi = document.openapi;
    if (typeof openapi === 'string') {
      return openapi.startsWith('3.') ? { supported: true } : { supported: false, format: `OpenAPI ${openapi}` };
    }
    if (document.swagger !== undefined) {
      return { supported: false, format: `Swagger ${this.versionLabel(document.swagger)}` };
    }
    if (document.asyncapi !== undefined) {
      return { supported: false, format: `AsyncAPI ${this.versionLabel(document.asyncapi)}` };
    }
    return { supported: false, format: null };
  }

  // Version keys are strings in well-formed documents; anything else is named rather than
  // stringified into `[object Object]`.
  private versionLabel(version: unknown): string {
    return typeof version === 'string' || typeof version === 'number' ? `${version}` : '(unknown version)';
  }

  private uniqueSlug(fileName: FileName, used: Set<string>): string {
    const base = fileName.normalize().toString() || 'api';
    let slug = base;
    let suffix = 2;
    while (used.has(slug)) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(slug);
    return slug;
  }

  /** What a pre-2.0 build file offers towards a `portal.json`, or null when there is none. */
  private async migration(): Promise<PortalMigration | null> {
    if (!(await this.fileService.fileExists(this.legacyBuildFile))) {
      return null;
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(await this.fileService.getContents(this.legacyBuildFile));
    } catch {
      return null;
    }

    const portal = data.generatePortal;
    const versionedPortal = data.generateVersionedPortal;
    if (typeof portal !== 'object' || portal === null) {
      return versionedPortal === undefined
        ? null
        : { suggestedConfig: PortalConfig.create('My API'), unsupportedFields: ['generateVersionedPortal'] };
    }

    const portalFields = portal as Record<string, unknown>;
    const title = typeof portalFields.pageTitle === 'string' ? portalFields.pageTitle : 'My API';
    const logo = typeof portalFields.logoUrl === 'string' ? portalFields.logoUrl : null;

    const unsupportedFields = Object.keys(portalFields)
      .filter((field) => !MIGRATABLE_PORTAL_FIELDS.has(field))
      .sort((a, b) => a.localeCompare(b));
    if (versionedPortal !== undefined) {
      unsupportedFields.push('generateVersionedPortal');
    }

    return {
      suggestedConfig: PortalConfig.create(title, null, logo),
      unsupportedFields
    };
  }
}
