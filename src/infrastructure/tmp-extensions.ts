import { realpathSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { withDir } from 'tmp-promise';

/**
 * Windows gives a profile name longer than eight characters an 8.3 alias, and `os.tmpdir()`
 * answers with it. The dev server's allow-list holds the real name, so the two spellings of one
 * directory never match and every page under it is refused. Whatever compares paths has to see
 * one spelling, and the real one is it.
 */
export function canonical(directory: string): string {
  try {
    return realpathSync.native(directory);
  } catch {
    return directory;
  }
}

export function withDirPath<T>(fn: (results: DirectoryPath) => Promise<T>): Promise<T> {
  return withDir((results) => fn(new DirectoryPath(canonical(results.path))), { unsafeCleanup: true });
}

/** Name of the folder created beside a project when the system temp directory is unusable. */
export const PORTAL_PROJECT_DIRECTORY_NAME = '.apimatic-build';

/**
 * Where a portal project may live for a source directory. The system temp directory,
 * unless it sits on a different Windows drive from the source: a page imports an image from
 * the static directory by a path relative to the page, and `path.relative` cannot express one
 * across drives. GitHub's Windows runners (workspace on D:, temp on C:) are the common case.
 */
export function portalProjectDirectoryBase(
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
  return path.win32.join(path.win32.dirname(source), PORTAL_PROJECT_DIRECTORY_NAME);
}

/** Creates the base directory when it is the project-side fallback, hidden from git. */
export async function ensurePortalProjectDirectoryBase(
  sourceDirectory: DirectoryPath,
  systemTemp: string = os.tmpdir()
): Promise<string> {
  const base = portalProjectDirectoryBase(sourceDirectory.toString(), systemTemp);
  if (base !== systemTemp) {
    await fs.mkdir(base, { recursive: true });
    // A gitignore that ignores everything keeps the folder out of the user's status while it exists.
    await fs.writeFile(path.join(base, '.gitignore'), '*\n');
  }
  return base;
}

/**
 * Like `withDirPath`, for a portal project that must read files under `sourceDirectory`.
 * The project-side fallback folder is removed again once it is empty.
 */
export async function withPortalProjectDirectory<T>(
  sourceDirectory: DirectoryPath,
  fn: (directory: DirectoryPath) => Promise<T>,
  systemTemp: string = os.tmpdir()
): Promise<T> {
  const base = await ensurePortalProjectDirectoryBase(sourceDirectory, systemTemp);
  try {
    return await withDir((results) => fn(new DirectoryPath(canonical(results.path))), {
      tmpdir: base,
      unsafeCleanup: true
    });
  } finally {
    await removePortalProjectDirectoryBase(base, systemTemp);
  }
}

/**
 * The project-side fallback folder is shared by every invocation for that project, so it is
 * only taken down once nothing else is in it -- otherwise a `portal generate` finishing
 * beside a running `portal serve` puts that live portal project into the user's `git status`.
 * Failures are swallowed: a portal that has been written is not a crash.
 */
export async function removePortalProjectDirectoryBase(base: string, systemTemp: string = os.tmpdir()): Promise<void> {
  if (base === systemTemp) {
    return;
  }
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
