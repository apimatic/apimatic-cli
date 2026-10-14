import { isJsonObject, JsonObject } from '../../utils/json-utils.js';
import { stripByteOrderMark } from '../../utils/string-utils.js';

/** The merge settings a portal follows, as the metadata file names them; `configuration` holds the other two. */
export const MERGE_SETTINGS = {
  configuration: 'MergeConfiguration',
  mergeApis: 'MergeApis',
  order: 'MergeOrderOfDirectories'
} as const;

// The platform matches a setting's name in any case, as its JSON reader does, the exact name first.
const setting = (object: JsonObject, name: string): unknown =>
  name in object ? object[name] : Object.entries(object).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];

/** The platform's metadata file beside API definitions, read for the one thing a portal follows: which folders it merges. */
export class SpecMetadata {
  private constructor(private readonly mergeConfiguration: JsonObject) {}

  /** Undefined when the text is not JSON. */
  public static parse(contents: string): SpecMetadata | undefined {
    try {
      const document: unknown = JSON.parse(stripByteOrderMark(contents));
      const mergeConfiguration = isJsonObject(document) ? setting(document, MERGE_SETTINGS.configuration) : undefined;
      return new SpecMetadata(isJsonObject(mergeConfiguration) ? mergeConfiguration : {});
    } catch {
      return undefined;
    }
  }

  /** On for `true`, and for the text `"true"`, which the platform reads as the same. */
  public mergesApis(): boolean {
    const mergeApis = setting(this.mergeConfiguration, MERGE_SETTINGS.mergeApis);
    return mergeApis === true || (typeof mergeApis === 'string' && mergeApis.toLowerCase() === 'true');
  }

  /** The folders merged, in order, relative to the file's own; null when it lists none, which merges every folder there by name. */
  public mergeOrder(): string[] | null {
    const order = setting(this.mergeConfiguration, MERGE_SETTINGS.order);
    const folders = Array.isArray(order) ? order.filter((folder): folder is string => typeof folder === 'string') : [];
    return folders.length > 0 ? folders : null;
  }
}
