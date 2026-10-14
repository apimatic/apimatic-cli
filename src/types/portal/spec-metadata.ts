import { isJsonObject, JsonObject } from '../../utils/json-utils.js';
import { stripByteOrderMark } from '../../utils/string-utils.js';

/** The settings of its `MergeConfiguration` a portal follows, by the names a message gives them. */
export const MERGE_SETTINGS = { mergeApis: 'MergeApis', order: 'MergeOrderOfDirectories' } as const;

/** The platform's metadata file beside API definitions, read for the one thing a portal follows: which folders it merges. */
export class SpecMetadata {
  private constructor(private readonly mergeConfiguration: JsonObject) {}

  /** Undefined when the text is not JSON. */
  public static parse(contents: string): SpecMetadata | undefined {
    try {
      const document: unknown = JSON.parse(stripByteOrderMark(contents));
      const mergeConfiguration = isJsonObject(document) ? document.MergeConfiguration : undefined;
      return new SpecMetadata(isJsonObject(mergeConfiguration) ? mergeConfiguration : {});
    } catch {
      return undefined;
    }
  }

  public mergesApis(): boolean {
    return this.mergeConfiguration[MERGE_SETTINGS.mergeApis] === true;
  }

  /** The folders merged, in order, relative to the file's own; null when it lists none, which merges every folder there by name. */
  public mergeOrder(): string[] | null {
    const order = this.mergeConfiguration[MERGE_SETTINGS.order];
    const folders = Array.isArray(order) ? order.filter((folder): folder is string => typeof folder === 'string') : [];
    return folders.length > 0 ? folders : null;
  }
}
