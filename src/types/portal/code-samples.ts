import { Language, LANGUAGE_CHOICES } from '../sdk/generate.js';
import { isJsonObject } from '../common/json-object.js';
import { Endpoint } from './endpoint.js';
import type { OpenApiDocument } from './openapi-document.js';

type Sources = Record<string, string>;

export interface CodeSample {
  lang: Language;
  label: string;
  sources: Sources;
}

export class CodeSampleCatalog {
  private constructor(private readonly samplesByEndpoint: Map<string, CodeSample>) {}

  public static fromJson(language: Language, json: unknown): CodeSampleCatalog | undefined {
    if (!isJsonObject(json) || !isJsonObject(json.paths)) {
      return undefined;
    }

    const samplesByEndpoint = new Map<string, CodeSample>();
    for (const [path, methods] of Object.entries(json.paths)) {
      if (!isJsonObject(methods)) {
        return undefined;
      }
      for (const [method, sources] of Object.entries(methods)) {
        if (!isSources(sources)) {
          return undefined;
        }
        samplesByEndpoint.set(`${new Endpoint(method, path)}`, toCodeSample(language, sources));
      }
    }
    return new CodeSampleCatalog(samplesByEndpoint);
  }

  public sampleFor(endpoint: Endpoint): CodeSample | undefined {
    return this.samplesByEndpoint.get(`${endpoint}`);
  }

  public endpoints(): string[] {
    return [...this.samplesByEndpoint.keys()];
  }
}

export class CodeSamples {
  constructor(private readonly catalogs: CodeSampleCatalog[]) {}

  public isEmpty(): boolean {
    return this.catalogs.length === 0;
  }

  public samplesFor(endpoint: Endpoint): CodeSample[] {
    return this.catalogs.flatMap((catalog) => catalog.sampleFor(endpoint) ?? []);
  }

  public unplacedIn(documents: OpenApiDocument[]): string[] {
    const documented = new Set(documents.flatMap((document) => document.endpoints()).map(String));
    const sampled = new Set(this.catalogs.flatMap((catalog) => catalog.endpoints()));
    return [...sampled].filter((endpoint) => !documented.has(endpoint));
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
