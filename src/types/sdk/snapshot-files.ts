/** A snapshot's files by their path below the SDK directory, with `/` between segments, as git names them. */
export type SnapshotFiles = ReadonlyMap<string, Uint8Array>;
