import { Language, LANGUAGE_CHOICES } from '../sdk/generate.js';
import { Endpoint } from './endpoint.js';
import type { OpenApiDocument } from './openapi-document.js';

const UNNAMED_EXAMPLE_ID = 'Example';

type Sources = Record<string, string>;

export interface CodeSample {
  lang: Language;
  label: string;
  sources: Sources;
}

export class CodeSampleCatalog {
  private constructor(private readonly samplesByEndpoint: Map<string, CodeSample>) {}

  public static fromJson(language: Language, json: unknown): CodeSampleCatalog | undefined {
    if (!isRecord(json) || !isRecord(json.paths)) {
      return undefined;
    }

    const samplesByEndpoint = new Map<string, CodeSample>();
    for (const [path, methods] of Object.entries(json.paths)) {
      if (!isRecord(methods)) {
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
  public static readonly none = new CodeSamples([]);

  constructor(private readonly catalogs: CodeSampleCatalog[]) {}

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
  const named = Object.entries(sources).filter(([exampleId]) => exampleId !== UNNAMED_EXAMPLE_ID);
  return {
    lang: language,
    label: languageLabel(language),
    sources: named.length > 0 ? Object.fromEntries(named) : sources
  };
}

function languageLabel(language: Language): string {
  return LANGUAGE_CHOICES.find((choice) => choice.value === language)?.label ?? language;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSources(value: unknown): value is Sources {
  return isRecord(value) && Object.values(value).every((source) => typeof source === 'string');
}
