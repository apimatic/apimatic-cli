import { err, ok, Result } from 'neverthrow';
import { stripByteOrderMark } from '../../utils/string-utils.js';
import { PLUGIN_ID_PATTERN } from '../plugin/plugin-config.js';
import { SemVersion } from '../publish/version.js';

export const APIMATIC_CONFIG_FILE_NAME = 'apimatic.json';

/** The one format this CLI reads. A file naming another is refused rather than misread. */
export const SCHEMA_VERSION = 1;

/** A block one command owns. */
export type ConfigBlockName = 'portal' | 'plugin' | 'languages';

/** Where a finding comes from: a block, or `root` for the file itself and the keys beside the blocks. */
export type ConfigBlock = 'root' | ConfigBlockName;

/**
 * Something wrong with the file, kept apart from its wording. The portal path lists findings
 * one sentence each and the plugin path folds them into one clause behind the file's name; both
 * read the same `field` and `problem`, so the two cannot drift.
 */
export interface ConfigFinding {
  block: ConfigBlock;
  /** The key the finding is about, as a dotted path from the root, or null for the file as a whole. */
  field: string | null;
  /** What is wrong with it, as a predicate: "is not a JSON object". */
  problem: string;
}

const NOT_A_JSON_OBJECT = 'is not a JSON object';

const MALFORMED_PLUGIN_ID = `must be lower-case alphanumeric words separated by single dashes, for example 'acme-payments'`;

const MALFORMED_PLUGIN_VERSION = `must be a version in the format major.minor.patch, for example '0.1.0'`;

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The parsed `apimatic.json`: its blocks, the keys around them in the order written, and what is wrong with it. */
export class ApimaticConfigDocument {
  private constructor(
    private readonly root: Record<string, unknown>,
    private readonly findings: readonly ConfigFinding[]
  ) {}

  /** What a file the CLI creates starts from. */
  public static empty(): ApimaticConfigDocument {
    return ApimaticConfigDocument.of({ schemaVersion: SCHEMA_VERSION });
  }

  /**
   * Refuses only what no command could use: a file holding no JSON object at all. Everything
   * else parses, and what is wrong inside it is carried as findings for each command to read or
   * ignore by block, so a malformed block one command owns never stops another.
   */
  public static parse(text: string): Result<ApimaticConfigDocument, ConfigFinding[]> {
    const contents = stripByteOrderMark(text);
    if (contents.trim() === '') {
      return err([{ block: 'root', field: null, problem: 'is empty' }]);
    }
    let data: unknown;
    try {
      data = JSON.parse(contents);
    } catch {
      return err([{ block: 'root', field: null, problem: 'is not valid JSON' }]);
    }
    if (!isJsonObject(data)) {
      return err([{ block: 'root', field: null, problem: NOT_A_JSON_OBJECT }]);
    }
    return ok(ApimaticConfigDocument.of(data));
  }

  private static of(root: Record<string, unknown>): ApimaticConfigDocument {
    return new ApimaticConfigDocument(root, ApimaticConfigDocument.analyze(root));
  }

  // The shape checks are what the writers need: a merge spreads a block, which turns a string
  // into `{"0":"a"}` and a number into nothing, so a wrong shape is refused before it can
  // corrupt the file. The identity checks are the plugin's own rules, reported here so the
  // portal path can leave them unread.
  private static analyze(root: Record<string, unknown>): ConfigFinding[] {
    const findings: ConfigFinding[] = [];

    const schemaVersion = root.schemaVersion;
    if (schemaVersion !== undefined && schemaVersion !== SCHEMA_VERSION) {
      const written = JSON.stringify(schemaVersion);
      findings.push({
        block: 'root',
        field: 'schemaVersion',
        problem: `is ${written}, which this version of the CLI does not read; it reads ${SCHEMA_VERSION}`
      });
    }

    const plugin = root.plugin;
    if (plugin !== undefined) {
      if (!isJsonObject(plugin)) {
        findings.push({ block: 'plugin', field: 'plugin', problem: NOT_A_JSON_OBJECT });
      } else {
        const id = plugin.pluginId;
        if (typeof id === 'string' && (id.trim() === '' || !PLUGIN_ID_PATTERN.test(id))) {
          findings.push({ block: 'plugin', field: 'plugin.pluginId', problem: MALFORMED_PLUGIN_ID });
        }
        const version = plugin.pluginVersion;
        if (typeof version === 'string' && (version.trim() === '' || SemVersion.tryCreate(version).isErr())) {
          findings.push({ block: 'plugin', field: 'plugin.pluginVersion', problem: MALFORMED_PLUGIN_VERSION });
        }
      }
    }

    const languages = root.languages;
    if (languages !== undefined) {
      if (!isJsonObject(languages)) {
        findings.push({ block: 'languages', field: 'languages', problem: NOT_A_JSON_OBJECT });
      } else {
        for (const [language, entry] of Object.entries(languages)) {
          if (!isJsonObject(entry)) {
            findings.push({ block: 'languages', field: `languages.${language}`, problem: NOT_A_JSON_OBJECT });
          }
        }
      }
    }

    return findings;
  }

  /** As written, whatever that is: the portal's own parser says what is wrong with it. */
  public portal(): unknown {
    return this.root.portal;
  }

  /** The block, or undefined when it is absent or, as the findings say, not an object. */
  public plugin(): Record<string, unknown> | undefined {
    return isJsonObject(this.root.plugin) ? this.root.plugin : undefined;
  }

  /** The block, or undefined when it is absent or, as the findings say, not an object. */
  public languages(): Record<string, unknown> | undefined {
    return isJsonObject(this.root.languages) ? this.root.languages : undefined;
  }

  public findingsFor(...blocks: ConfigBlock[]): ConfigFinding[] {
    return this.findings.filter((finding) => blocks.includes(finding.block));
  }

  /**
   * The document with one block replaced. A block the file already holds keeps its place among
   * the other keys; a new one goes after the last.
   */
  public with(block: ConfigBlockName, value: object): ApimaticConfigDocument {
    return ApimaticConfigDocument.of({ ...this.root, [block]: value });
  }

  /** The file's text, keys in the order held, in the indentation and with the ending the caller found. */
  public serialize(indent: string, trailingNewline: boolean): string {
    return JSON.stringify(this.root, null, indent) + (trailingNewline ? '\n' : '');
  }
}

/** One sentence per finding, each naming the file or the field, for a list a user fixes one line at a time. */
export function findingSentences(findings: readonly ConfigFinding[]): string[] {
  return findings.map(({ field, problem }) =>
    field === null ? `${APIMATIC_CONFIG_FILE_NAME} ${problem}.` : `'${field}' ${problem}.`
  );
}

/**
 * Every finding as one clause about the file, for a message that has already named it:
 * "it is empty", "its 'languages' is not a JSON object".
 */
export function findingClause(findings: readonly ConfigFinding[]): string {
  return findings
    .map(({ field, problem }) => (field === null ? `it ${problem}` : `its '${field}' ${problem}`))
    .join('; ');
}
