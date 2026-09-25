import { DirectoryPath } from '../file/directoryPath.js';
import { FileName } from '../file/fileName.js';
import { FilePath } from '../file/filePath.js';
import { Endpoint } from './endpoint.js';
import { SuggestedSite } from './config/site-config.js';
import { ContentNotices } from './content-notices.js';
import { GeneratedPages, GeneratedSection } from './generated-pages.js';
import { PortalConfig } from './portal-config.js';

/** An OpenAPI document found in `src/spec/`, with the slug its section is mounted at. */
export interface PortalSpec {
  slug: string;
  file: FilePath;
  /** Its operations, including those behind a `$ref` path item. */
  endpoints: Endpoint[];
}

/** What `apimatic.json` decides about a portal, which `portal serve` reads again on every edit. */
export interface PortalSettings {
  config: PortalConfig;
  generatedPages: GeneratedPages;
}

/** A validated portal source directory, ready to be built. */
export interface PortalSource extends PortalSettings {
  /**
   * What the only specification says about itself, or null with several. Kept so `portal serve`
   * can judge an edited config without reading the specifications again.
   */
  suggestedSite: SuggestedSite | null;
  specs: PortalSpec[];
  contentDirectory: DirectoryPath | null;
  staticDirectory: DirectoryPath | null;
  shadowedFiles: FileName[];
  contentNotices: ContentNotices;
}

/** Why a source directory could not be written; each variant maps to its own message. */
export type PortalScaffoldProblem =
  | { kind: 'configUnreadable' }
  | { kind: 'configUnwritable' }
  // `reason` is the message of whatever the file service raised, which nothing here can narrow.
  | { kind: 'sourceUnwritable'; reason: string };

export interface MissingStaticFile {
  setting: string;
  file: FilePath;
  /**
   * The same file in another case, when there is one. Found here because Windows and macOS
   * ignore case, but a link in it 404s on the hosts portals are published to, which do not.
   */
  foundAs: FilePath | null;
}

/** A page of the user's served at an address the CLI keeps for the pages it generates. */
export interface ReservedAddressPage {
  file: FilePath;
  /** Where the page would be served, which a `(group)` folder makes differ from its path. */
  address: string;
  section: GeneratedSection;
}

/** Pages of the user's that would be served at one address, which only one of them can have. */
export interface SharedAddress {
  address: string;
  pages: FilePath[];
}

/** A page's Markdown image that the build would import and not find, which fails the whole build. */
export interface MissingImage {
  page: FilePath;
  line: number;
  url: string;
  /** Where the build looks; null for an image beside its page that points out of `content/`. */
  file: FilePath | null;
  /** The file in another case, as `MissingStaticFile` has it. */
  foundAs: FilePath | null;
}

/** Why `content/` cannot be built; each variant maps to its own message. */
export type ContentProblem =
  | { kind: 'unreadableContent' }
  | { kind: 'groupNamedPages'; pages: FilePath[] }
  | { kind: 'reservedAddresses'; pages: ReservedAddressPage[] }
  | { kind: 'sharedAddresses'; addresses: SharedAddress[] }
  | { kind: 'invalidFrontMatter'; errors: string[] }
  | { kind: 'invalidNavigation'; errors: string[] }
  | { kind: 'missingImages'; images: MissingImage[] };

/** How `api transform` would turn the first document in `spec/` into one the portal reads. */
export interface SpecConversion {
  file: FilePath;
  /** What the document is instead, when it says; null for one that names no format. */
  format: string | null;
  /** Where `api transform --destination` of `spec/` writes it, which is one folder too deep. */
  converted: FilePath;
  /** How many more documents there are to convert the same way. */
  others: number;
}

/** Why a source directory cannot be built; each variant maps to its own message. */
export type PortalSourceProblem =
  | { kind: 'missingConfig' }
  // `missingPortal`: the block itself is absent, which is what quickstart sets up.
  | { kind: 'invalidConfig'; errors: string[]; missingPortal: boolean }
  // Every problem found in `content/`, so that one run lists all that a build would refuse.
  | { kind: 'invalidContent'; problems: ContentProblem[] }
  | { kind: 'unreadableSpec'; fileName: FileName }
  // Its `folders` are not read, and `api transform` writes into one of its own.
  | { kind: 'emptySpecDirectory'; folders: DirectoryPath[] }
  | { kind: 'noOpenApiSpec'; conversion: SpecConversion }
  | { kind: 'missingStaticFiles'; files: MissingStaticFile[] };
