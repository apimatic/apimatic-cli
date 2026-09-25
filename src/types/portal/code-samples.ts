import { Language, LANGUAGE_CHOICES } from '../sdk/generate.js';
import { isJsonObject } from '../../utils/json-utils.js';
import { Endpoint } from './endpoint.js';

type Sources = Record<string, string>;

export interface CodeSample {
  lang: Language;
  label: string;
  sources: Sources;
}

/** Each endpoint's samples, keyed by path and then by upper-case method: what the portal template reads. */
export type CodeSampleCatalogsJson = Record<string, Record<string, CodeSample[]>>;

interface CatalogEntry {
  endpoint: Endpoint;
  sample: CodeSample;
}

export class CodeSampleCatalog {
  private constructor(private readonly samplesByEndpoint: Map<string, CatalogEntry>) {}

  public static fromJson(language: Language, json: unknown): CodeSampleCatalog | undefined {
    if (!isJsonObject(json) || !isJsonObject(json.paths)) {
      return undefined;
    }

    const samplesByEndpoint = new Map<string, CatalogEntry>();
    for (const [path, methods] of Object.entries(json.paths)) {
      if (!isJsonObject(methods)) {
        return undefined;
      }
      for (const [method, sources] of Object.entries(methods)) {
        if (!isSources(sources)) {
          return undefined;
        }
        const endpoint = new Endpoint(method, path);
        samplesByEndpoint.set(`${endpoint}`, { endpoint, sample: toCodeSample(language, sources) });
      }
    }
    return new CodeSampleCatalog(samplesByEndpoint);
  }

  public sampleFor(endpoint: Endpoint): CodeSample | undefined {
    return this.samplesByEndpoint.get(`${endpoint}`)?.sample;
  }

  public endpoints(): Endpoint[] {
    return [...this.samplesByEndpoint.values()].map(({ endpoint }) => endpoint);
  }
}

export class CodeSampleCatalogs {
  constructor(private readonly catalogs: CodeSampleCatalog[]) {}

  public isEmpty(): boolean {
    return this.catalogs.length === 0;
  }

  public samplesFor(endpoint: Endpoint): CodeSample[] {
    return this.catalogs.flatMap((catalog) => catalog.sampleFor(endpoint) ?? []);
  }

  public unplacedIn(documented: Endpoint[]): string[] {
    const names = new Set(documented.map(String));
    return [...new Set(this.endpoints().map(String))].filter((endpoint) => !names.has(endpoint));
  }

  public toJson(): CodeSampleCatalogsJson {
    const json: CodeSampleCatalogsJson = {};
    for (const endpoint of this.endpoints()) {
      json[endpoint.path] = { ...json[endpoint.path], [endpoint.method]: this.samplesFor(endpoint) };
    }
    return json;
  }

  private endpoints(): Endpoint[] {
    return this.catalogs.flatMap((catalog) => catalog.endpoints());
  }
}

function toCodeSample(language: Language, sources: Sources): CodeSample {
  return { lang: language, label: languageLabel(language), sources };
}

function languageLabel(language: Language): string {
  return LANGUAGE_CHOICES.find((choice) => choice.value === language)?.label ?? language;
}

function isSources(value: unknown): value is Sources {
  return isJsonObject(value) && Object.values(value).every((source) => typeof source === 'string');
}
