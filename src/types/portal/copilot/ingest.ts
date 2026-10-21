/** What the Ask AI service answers an upload with: `unchanged` when the pages match the version it already serves. */
export interface IngestReceipt {
  versionId: string;
  status: 'queued' | 'unchanged';
  pageCount: number;
}

export type IndexingState = 'queued' | 'building' | 'active' | 'superseded' | 'failed';

export interface IngestStatus {
  versionId: string;
  status: IndexingState;
  pageCount: number;
  changedPages: number;
  removedPages: number;
  chunkCount: number;
  error: string | null;
}

/** How an upload's indexing ended: serving its pages, or replaced by a newer upload before it could. */
export type IndexedVersion = IngestStatus & { status: 'active' | 'superseded' };
