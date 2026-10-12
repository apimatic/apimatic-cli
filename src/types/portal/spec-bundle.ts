import { FilePath } from '../file/filePath.js';
import { Endpoint } from './endpoint.js';
import { OpenApiDocument } from './openapi-document.js';

/** A file a `$ref` names, with the file the `$ref` is written in. */
export interface ReferencedFile {
  file: FilePath;
  referencedBy: FilePath;
}

/** A specification and every file the portal's bundler embeds into it, added as each is read. */
export class SpecBundle {
  private readonly rootIds: ReadonlySet<string>;
  private readonly documents = new Map<string, OpenApiDocument>();
  private readonly named = new Map<string, ReferencedFile>();

  constructor(private readonly file: FilePath, private readonly document: OpenApiDocument) {
    this.rootIds = document.schemaIds();
    this.add(file, document);
  }

  /** Records `document` as read from `file`, and names the files it refers to. */
  public add(file: FilePath, document: OpenApiDocument): void {
    this.documents.set(key(file), document);
    for (const referenced of document.referencedFiles(file.directory(), this.rootIds)) {
      if (!this.named.has(key(referenced))) {
        this.named.set(key(referenced), { file: referenced, referencedBy: file });
      }
    }
  }

  /** The files named but not read yet, each with the first file to name it. */
  public unread(): ReferencedFile[] {
    return [...this.named].flatMap(([name, referenced]) => (this.documents.has(name) ? [] : [referenced]));
  }

  /** Its operations; a path item in another file is read from it, but not one that file refers on to. */
  public endpoints(): Endpoint[] {
    const mounted = this.document
      .pathItemReferences(this.file.directory())
      .flatMap(({ path, file, pointer }) => this.documents.get(key(file))?.endpointsAt(path, pointer) ?? []);
    return [...this.document.endpoints(), ...mounted];
  }
}

// By path rather than by `isEqual`: a split specification runs to thousands of files.
function key(file: FilePath): string {
  return file.toString();
}
