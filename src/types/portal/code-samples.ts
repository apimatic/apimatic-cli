import { DirectoryPath } from '../file/directoryPath.js';
import { Language, languageLabel } from '../sdk/generate.js';
import { isJsonObject } from '../../utils/json-utils.js';
import { Endpoint } from './endpoint.js';
import { PortalSpec } from './portal-source.js';
import { shared } from './shared.js';

type Sources = Record<string, string>;

export interface CodeSample {
  lang: Language;
  label: string;
  sources: Sources;
}

/** Each endpoint's samples, keyed by path and then by upper-case method. */
export type CodeSamplesByEndpoint = Record<string, Record<string, CodeSample[]>>;

/** What the portal template reads: each spec's own samples by its slug, and the samples of the others in `paths`. */
export interface CodeSamplesFile {
  paths: CodeSamplesByEndpoint;
  specs: Record<string, CodeSamplesByEndpoint>;
}

export interface EndpointSample {
  endpoint: Endpoint;
  sample: CodeSample;
}

/** One language's samples, as one `/portal-artifacts` run delivers them. */
export class CodeSampleCatalog {
  private constructor(
    private readonly paths: EndpointSample[],
    /** By the spec's main file relative to `spec/`, as the platform records it; none when the operations come from one spec. */
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

  public unplacedIn(documented: Endpoint[]): string[] {
    const names = new Set(documented.map(String));
    const endpoints = this.catalogs.flatMap((catalog) => catalog.samples().map(({ endpoint }) => String(endpoint)));
    return [...new Set(endpoints)].filter((endpoint) => !names.has(endpoint));
  }
}

/**
 * The samples of one run, placed on the specs the portal documents: those filed by spec on their
 * spec alone, and the others on every spec, but for an operation two specs declare, which one
 * sample per method and path cannot serve.
 */
export class PlacedCodeSamples {
  private readonly sharedEndpoints: Set<string>;

  constructor(
    private readonly catalogs: CodeSampleCatalog[],
    private readonly specs: PortalSpec[],
    private readonly specDirectory: DirectoryPath
  ) {
    const claims = specs.flatMap(({ file, endpoints }) => endpoints.map((key) => ({ key, file })));
    this.sharedEndpoints = new Set(shared(claims).map(({ key }) => String(key)));
  }

  public toJson(): CodeSamplesFile {
    const unfiled = this.catalogs
      .filter((catalog) => !catalog.isFiledBySpec())
      .flatMap((catalog) => catalog.samples())
      .filter(({ endpoint }) => !this.sharedEndpoints.has(String(endpoint)));
    return {
      paths: byEndpoint(unfiled),
      specs: Object.fromEntries(
        this.specs.flatMap(({ slug, file }): [string, CodeSamplesByEndpoint][] => {
          const specFile = file.relativeTo(this.specDirectory);
          const own = this.catalogs.flatMap((catalog) => catalog.samplesOf(specFile));
          return own.length === 0 ? [] : [[slug, byEndpoint(own)]];
        })
      )
    };
  }
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
