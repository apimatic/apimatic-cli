import { DirectoryPath } from '../file/directoryPath.js';
import { FileName } from '../file/fileName.js';
import { FilePath } from '../file/filePath.js';
import { Endpoint } from './endpoint.js';
import { SuggestedSite } from './config/site-config.js';
import { ContentNotices } from './content-notices.js';
import { GeneratedPages } from './generated-pages.js';
import { ParseFailure } from './openapi-document.js';
import { PageSyntaxError } from './page.js';
import { PortalConfig } from './portal-config.js';
import { Shared } from './shared.js';
import { UnresolvableReference } from './spec-bundle.js';

/** An OpenAPI document found in `src/spec/` or in a folder merged there, with the slug its section is mounted at. */
export interface PortalSpec {
  slug: string;
  file: FilePath;
  /** Its operations, including those behind a `$ref` path item. */
  endpoints: Endpoint[];
}

/** An operation more than one specification declares, which one code sample per method and path cannot serve. */
export type SharedEndpoint = Shared<Endpoint>;

/** A part of the source directory that `portal serve` watches, and checks on each save. */
export type WatchedSource = 'config' | 'content' | 'spec';

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
  /** `spec/`, whose every file the preview reloads on, as a specification may refer to any of them. */
  specDirectory: DirectoryPath;
  /** Several specifications at the top of `spec/` that no `APIMATIC-META.json` merges, so the SDKs cover one; else none. */
  unmergedSpecs: FilePath[];
  /** API definitions at the top of `spec/` while its folders are merged, which the portal and the SDKs leave out. */
  leftOutSpecs: FilePath[];
  /** Shown with no SDK sample, since the samples hold one per method and path. */
  sharedEndpoints: SharedEndpoint[];
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

/** A file the build reads and cannot find. */
export interface MissingFile {
  file: FilePath;
  /**
   * The same file in another case, when there is one. Found here because Windows and macOS
   * ignore case, but a link in it 404s on the hosts portals are published to, which do not.
   */
  foundAs: FilePath | null;
}

/** A file `apimatic.json` names, by the setting that names it. */
export interface MissingStaticFile extends MissingFile {
  setting: string;
}

/** An address the portal serves a page of its own at: a generated section's, and every one below it, or a single page's. */
export interface ReservedAddress {
  address: string;
  /** What a message says the address is kept for. */
  description: string;
}

/** A page of the user's served at an address the portal keeps for a page of its own. */
export interface ReservedAddressPage {
  file: FilePath;
  /** Where the page would be served, which a `(group)` folder makes differ from its path. */
  address: string;
  keptFor: ReservedAddress;
}

/** Pages of the user's that would be served at one address, which only one of them can have. */
export type SharedAddress = Shared<string>;

/** A page's Markdown image that the build would import and not find, which fails the whole build. */
export interface MissingImage {
  page: FilePath;
  line: number;
  url: string;
  /** Null for an image beside its page that points out of `content/`'s copy, which the build never looks for. */
  missing: MissingFile | null;
}

/** A page that is not valid MDX, at its first mistake. */
export interface InvalidPage extends PageSyntaxError {
  page: FilePath;
}

/** Why `content/` cannot be built; each variant maps to its own message. */
export type ContentProblem =
  | { kind: 'unreadableContent' }
  | { kind: 'groupNamedPages'; pages: FilePath[] }
  | { kind: 'reservedAddresses'; pages: ReservedAddressPage[] }
  | { kind: 'sharedAddresses'; addresses: SharedAddress[] }
  | { kind: 'invalidFrontMatter'; errors: string[] }
  | { kind: 'invalidNavigation'; errors: string[] }
  | { kind: 'missingImages'; images: MissingImage[] }
  | { kind: 'invalidMdx'; pages: InvalidPage[] };

/** How `api transform` would turn the first document in a directory into one the portal reads. */
export interface SpecConversion {
  file: FilePath;
  /** What the document is instead, when it says; null for one that names no format. */
  format: string | null;
  /** Where `api transform --destination` of the document's directory writes it, which is one folder too deep. */
  converted: FilePath;
  others: number;
}

/** Why a file a specification is read from could not be read; `unopened` carries what the file system said. */
export type UnreadableSpecReason =
  | ParseFailure
  | { kind: 'gone' }
  | { kind: 'folder' }
  | { kind: 'unopened'; message: string };

/** Why a source directory cannot be built; each variant maps to its own message. */
export type PortalSourceProblem =
  | { kind: 'missingConfig' }
  // `missingPortal`: the block itself is absent, which is what quickstart sets up.
  | { kind: 'invalidConfig'; errors: string[]; missingPortal: boolean }
  // Every problem found in `content/`, so that one run lists all that a build would refuse.
  | { kind: 'invalidContent'; problems: ContentProblem[] }
  | { kind: 'unreadableSpec'; file: FilePath; referencedBy: FilePath | null; reason: UnreadableSpecReason }
  | { kind: 'missingSpecReference'; missing: MissingFile; referencedBy: FilePath }
  | { kind: 'unresolvableSpecReference'; reference: UnresolvableReference }
  | { kind: 'unreadableMetadata'; file: FilePath }
  // Its `folders` are not read unless a metadata file merges them, and `api transform` writes into one of its own.
  | { kind: 'emptySpecDirectory'; folders: DirectoryPath[] }
  | { kind: 'noFoldersToMerge'; metadata: FilePath }
  // The `folders` that `metadata` names and the platform would not find: not there as spelt, or not inside `spec/`.
  | { kind: 'missingMergedFolders'; metadata: FilePath; folders: DirectoryPath[] }
  | { kind: 'emptyMergedFolders'; metadata: FilePath; folders: DirectoryPath[] }
  // Every file at the top of `folder` that names an API format; the platform builds the folder from one of them.
  | { kind: 'severalSpecsInFolder'; folder: DirectoryPath; files: FilePath[] }
  | { kind: 'noOpenApiSpec'; conversion: SpecConversion }
  | { kind: 'missingStaticFiles'; files: MissingStaticFile[] };
