/** What a publish is about to expose, counted recursively and excluding the repository itself. */
export interface PluginContents {
  fileCount: number;
  directoryCount: number;
}
