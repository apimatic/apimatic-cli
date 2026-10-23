import { DirectoryPath } from '../file/directoryPath.js';
import { FilePath } from '../file/filePath.js';
import { Language, languageLabel } from '../sdk/generate.js';
import { isJsonObject } from '../../utils/json-utils.js';
import { Endpoint } from './endpoint.js';
import { PortalSpec } from './portal-source.js';
import { Shared, shared } from './shared.js';

type Sources = Record<string, string>;

export interface CodeSample {
  lang: Language;
  label: string;
  sources: Sources;
}

/** Each endpoint's samples, keyed by path and then by upper-case method. */
export type CodeSamplesByEndpoint = Record<string, Record<string, CodeSample[]>>;

/** `code-samples.json`, which the template reads as `CodeSamplesFile`; a test holds the two to one shape. */
export interface CodeSamplesFile {
  paths: CodeSamplesByEndpoint;
  specs: Record<string, CodeSamplesByEndpoint>;
}

export interface EndpointSample {
  endpoint: Endpoint;
  sample: CodeSample;
}

/** An operation more than one spec declares, which one code sample per method and path cannot serve. */
export type SharedEndpoint = Shared<Endpoint>;

/**
 * Samples no operation takes: those filed under `spec` that it does not declare, or, for the
 * samples not filed by spec (`null`), those no spec declares.
 */
export interface UnplacedSamples {
  spec: FilePath | null;
  endpoints: Endpoint[];
}

/** One language's samples, as one `/portal-artifacts` run delivers them. */
export class CodeSampleCatalog {
  private constructor(
    private readonly paths: EndpointSample[],
    /**
     * By the spec's main file relative to `spec/`, as the platform records it; none when the
     * operations come from one spec.
     */
    private readonly specs: ReadonlyMap<string, EndpointSample[]>
  ) {}

  public static fromJson(language: Language, json: unknown): CodeSampleCatalog | undefined {
    if (!isJsonObject(json)) {
      return undefined;
    }
    const paths = samplesIn(language, json.paths);
    const specs = json.specs === undefined ? new Map<string, EndpointSample[]>() : specsIn(language, json.specs);
    return paths && specs ? new CodeSampleCatalog(paths, specs) : undefined;
  }

  public isFiledBySpec(): boolean {
    return this.specs.size > 0;
  }

  public samples(): EndpointSample[] {
    return this.paths;
  }

  public samplesOf(specFile: string): EndpointSample[] {
    return this.specs.get(specFile) ?? [];
  }
}

export class CodeSampleCatalogs {
  constructor(private readonly catalogs: CodeSampleCatalog[]) {}

  public isEmpty(): boolean {
    return this.catalogs.length === 0;
  }

  public placedOn(specs: PortalSpec[], specDirectory: DirectoryPath): PlacedCodeSamples {
    return new PlacedCodeSamples(this.catalogs, specs, specDirectory);
  }
}

/**
 * The samples of one run, placed on the specs the portal documents: those filed by spec on their
 * spec alone, and the others on every spec but for the shared endpoints.
 */
export class PlacedCodeSamples {
  private readonly shared: SharedEndpoint[];

  constructor(
    private readonly catalogs: CodeSampleCatalog[],
    private readonly specs: PortalSpec[],
    private readonly specDirectory: DirectoryPath
  ) {
    this.shared = shared(specs.flatMap(({ file, endpoints }) => endpoints.map((key) => ({ key, file }))));
  }

  /** The operations shown with no SDK sample because more than one spec declares them. */
  public sharedEndpoints(): SharedEndpoint[] {
    return this.catalogs.some((catalog) => !catalog.isFiledBySpec()) ? this.shared : [];
  }

  public unplaced(): UnplacedSamples[] {
    const declared = this.specs.flatMap(({ endpoints }) => endpoints);
    return [
      ...this.specs.map((spec) => ({ spec: spec.file, endpoints: undeclared(this.ownSamples(spec), spec.endpoints) })),
      { spec: null, endpoints: undeclared(this.unfiledSamples(), declared) }
    ].filter(({ endpoints }) => endpoints.length > 0);
  }

  public toJson(): CodeSamplesFile {
    const sharedKeys = new Set(this.shared.map(({ key }) => String(key)));
    return {
      paths: byEndpoint(this.unfiledSamples().filter(({ endpoint }) => !sharedKeys.has(String(endpoint)))),
      specs: Object.fromEntries(
        this.specs.flatMap((spec): [string, CodeSamplesByEndpoint][] => {
          const own = this.ownSamples(spec);
          return own.length === 0 ? [] : [[spec.slug, byEndpoint(own)]];
        })
      )
    };
  }

  private ownSamples({ file }: PortalSpec): EndpointSample[] {
    const specFile = file.relativeTo(this.specDirectory);
    return this.catalogs.flatMap((catalog) => catalog.samplesOf(specFile));
  }

  private unfiledSamples(): EndpointSample[] {
    return this.catalogs.filter((catalog) => !catalog.isFiledBySpec()).flatMap((catalog) => catalog.samples());
  }
}

/** The endpoints of `samples` that `declared` leaves out, each once. */
function undeclared(samples: EndpointSample[], declared: Endpoint[]): Endpoint[] {
  const names = new Set(declared.map(String));
  const left = samples.map(({ endpoint }) => endpoint).filter((endpoint) => !names.has(String(endpoint)));
  return left.filter((endpoint, index) => index === left.findIndex((other) => other.isEqual(endpoint)));
}

/** Languages in the order given, each endpoint's samples together. */
function byEndpoint(samples: EndpointSample[]): CodeSamplesByEndpoint {
  const json: CodeSamplesByEndpoint = {};
  for (const { endpoint, sample } of samples) {
    const methods = json[endpoint.path] ?? {};
    json[endpoint.path] = { ...methods, [endpoint.method]: [...(methods[endpoint.method] ?? []), sample] };
  }
  return json;
}

function specsIn(language: Language, specs: unknown): Map<string, EndpointSample[]> | undefined {
  if (!isJsonObject(specs)) {
    return undefined;
  }
  const samplesBySpec = new Map<string, EndpointSample[]>();
  for (const [specFile, spec] of Object.entries(specs)) {
    const samples = isJsonObject(spec) ? samplesIn(language, spec.paths) : undefined;
    if (samples === undefined) {
      return undefined;
    }
    samplesBySpec.set(specFile, samples);
  }
  return samplesBySpec;
}

/** One sample per endpoint, whatever the case its method is written in. */
function samplesIn(language: Language, paths: unknown): EndpointSample[] | undefined {
  if (!isJsonObject(paths)) {
    return undefined;
  }
  const samples = new Map<string, EndpointSample>();
  for (const [path, methods] of Object.entries(paths)) {
    if (!isJsonObject(methods)) {
      return undefined;
    }
    for (const [method, sources] of Object.entries(methods)) {
      if (!isSources(sources)) {
        return undefined;
      }
      const endpoint = new Endpoint(method, path);
      samples.set(`${endpoint}`, { endpoint, sample: toCodeSample(language, sources) });
    }
  }
  return [...samples.values()];
}

function toCodeSample(language: Language, sources: Sources): CodeSample {
  return { lang: language, label: languageLabel(language), sources };
}

function isSources(value: unknown): value is Sources {
  return isJsonObject(value) && Object.values(value).every((source) => typeof source === 'string');
}
