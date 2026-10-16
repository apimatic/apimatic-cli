import { FilePath } from '../file/filePath.js';
import { Endpoint } from './endpoint.js';
import { OpenApiDocument } from './openapi-document.js';

/** A file a `$ref` names, with the file the `$ref` is written in. */
export interface ReferencedFile {
  file: FilePath;
  referencedBy: FilePath;
}

/** A `$ref` the portal's bundler fails on, as written, with the file it is written in. */
export interface UnresolvableReference {
  file: FilePath;
  ref: string;
}

/** A specification and every file the portal's bundler embeds into it, added as each is read. */
export class SpecBundle {
  private readonly rootIds: ReadonlySet<string>;
  private readonly documents = new Map<string, OpenApiDocument>();
  private readonly named = new Map<string, ReferencedFile>();
  // Those of `named` not yet read, so a chain of files a level apiece is not scanned whole at each level.
  private pending: ReferencedFile[] = [];
  private readonly unresolved: UnresolvableReference[] = [];

  constructor(private readonly file: FilePath, private readonly document: OpenApiDocument) {
    this.rootIds = document.schemaIds();
    this.add(file, document);
  }

  /** Records `document` as read from `file`, and names the files it refers to. */
  public add(file: FilePath, document: OpenApiDocument): void {
    this.documents.set(key(file), document);
    const { files, unnamed } = document.references(file.directory(), this.rootIds);
    for (const referenced of files) {
      if (!this.named.has(key(referenced))) {
        const named = { file: referenced, referencedBy: file };
        this.named.set(key(referenced), named);
        this.pending.push(named);
      }
    }
    // An empty `$ref` fails anywhere; `#` and `#pet` only in the root, as the bundler makes an embedded file's pointers.
    const isRoot = file.isEqual(this.file);
    for (const ref of unnamed.filter((written) => isRoot || written === '')) {
      this.unresolved.push({ file, ref });
    }
  }

  /** The `$ref`s read so far that name no file the bundler can read, in the order read. */
  public unresolvable(): UnresolvableReference[] {
    return [...this.unresolved];
  }

  /** The files named but not read yet, each with the first file to name it. */
  public unread(): ReferencedFile[] {
    this.pending = this.pending.filter(({ file }) => !this.documents.has(key(file)));
    return [...this.pending];
  }

  /** Every file named, each with the first file to name it. */
  public referenced(): ReferencedFile[] {
    return [...this.named.values()];
  }

  /** Its operations; a path item in another file is read from it, but not one that file refers on to. */
  public endpoints(): Endpoint[] {
    const mounted = this.document
      .pathItemReferences(this.file.directory())
      .flatMap(({ path, file, pointer }) => this.documents.get(key(file))?.endpointsAt(path, pointer) ?? []);
    // A method beside a path item's `$ref` declares again what the file it refers to declares.
    const all = [...this.document.endpoints(), ...mounted];
    return all.filter((endpoint, index) => index === all.findIndex((other) => other.isEqual(endpoint)));
  }
}

// By path rather than by `isEqual`: a split specification runs to thousands of files.
function key(file: FilePath): string {
  return file.toString();
}
