import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { withDir } from 'tmp-promise';

export function withDirPath<T>(fn: (results: DirectoryPath) => Promise<T>): Promise<T> {
  return withDir((results) => fn(new DirectoryPath(results.path)), { unsafeCleanup: true });
}

/** Name of the folder created beside a project when the system temp directory is unusable. */
export const BUILD_DIRECTORY_NAME = '.apimatic-build';

/**
 * Where a portal build project may live for a source directory. The system temp directory,
 * unless it sits on a different Windows drive from the source: Vite's `import.meta.glob`
 * needs a relative path from the project to the content directory, and `path.relative`
 * cannot express one across drives, so the content pages would silently go missing.
 * GitHub's Windows runners (workspace on D:, temp on C:) are the common case.
 */
export function buildDirectoryBase(
  sourceDirectory: string,
  systemTemp: string = os.tmpdir(),
  platform: NodeJS.Platform = process.platform
): string {
  if (platform !== 'win32') return systemTemp;
  const source = path.win32.resolve(sourceDirectory);
  if (
    path.win32.parse(source).root.toLowerCase() === path.win32.parse(path.win32.resolve(systemTemp)).root.toLowerCase()
  ) {
    return systemTemp;
  }
  return path.win32.join(path.win32.dirname(source), BUILD_DIRECTORY_NAME);
}

/** Creates the base directory when it is the project-side fallback, hidden from git. */
export async function ensureBuildDirectoryBase(
  sourceDirectory: DirectoryPath,
  systemTemp: string = os.tmpdir()
): Promise<string> {
  const base = buildDirectoryBase(sourceDirectory.toString(), systemTemp);
  if (base !== systemTemp) {
    await fs.mkdir(base, { recursive: true });
    // A gitignore that ignores everything keeps the folder out of the user's status while it exists.
    await fs.writeFile(path.join(base, '.gitignore'), '*\n');
  }
  return base;
}

/**
 * Like `withDirPath`, for a build project that must read files under `sourceDirectory`.
 * The project-side fallback folder is removed again once it is empty.
 */
export async function withBuildDirectory<T>(
  sourceDirectory: DirectoryPath,
  fn: (directory: DirectoryPath) => Promise<T>,
  systemTemp: string = os.tmpdir()
): Promise<T> {
  const base = await ensureBuildDirectoryBase(sourceDirectory, systemTemp);
  try {
    return await withDir((results) => fn(new DirectoryPath(results.path)), { tmpdir: base, unsafeCleanup: true });
  } finally {
    if (base !== systemTemp) {
      await removeBuildDirectoryBase(base);
    }
  }
}

/**
 * The project-side fallback folder is shared by every invocation for that project, so it is
 * only taken down once nothing else is in it: removing the marker unconditionally made a
 * `portal generate` finishing beside a running `portal serve` put the live build tree into
 * the user's `git status`. Failures are swallowed, since a portal that has been written must
 * not be reported as a crash because the folder could not be tidied up.
 */
async function removeBuildDirectoryBase(base: string): Promise<void> {
  try {
    const remaining = await fs.readdir(base);
    if (remaining.some((entry) => entry !== '.gitignore')) {
      return;
    }
    await fs.rm(path.join(base, '.gitignore'), { force: true });
    await fs.rmdir(base);
  } catch {
    // Another run is using it, or it is already gone.
  }
}
