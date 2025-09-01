export interface DirectoryNode {
  [key: string]: DirectoryNode | string | null | undefined;
}
