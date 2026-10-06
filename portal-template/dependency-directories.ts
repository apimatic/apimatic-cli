import fs from 'node:fs';
import path from 'node:path';

// Safari runs a cached entry before its importer is transformed (apimatic-io#2287).
export function dependencyDirectories(portalProjectDirectory: string): string[] {
  const modules = path.join(portalProjectDirectory, 'node_modules');
  return narrowest(
    packageNames(modules)
      .filter((name) => isLink(path.join(modules, name)))
      .flatMap((name) => {
        const installed = realPath(path.join(modules, name));
        return installed === undefined ? [] : [holdingDirectory(installed, name)];
      })
  );
}

/** The one directory holding them all: the CLI's `node_modules` under npm, the store under pnpm. Each alone when only the disk's root would. */
export function narrowest(directories: string[]): string[] {
  let common: string | undefined = directories[0];
  for (const directory of directories.slice(1)) {
    while (common !== undefined && !isWithin(common, directory)) {
      common = isRoot(path.dirname(common)) ? undefined : path.dirname(common);
    }
  }
  return common === undefined ? directories : [common];
}

function packageNames(modules: string): string[] {
  return entries(modules).flatMap((name) =>
    name.startsWith('@') ? entries(path.join(modules, name)).map((scoped) => `${name}/${scoped}`) : [name]
  );
}

/** Where a package and the dependencies installed beside it sit, its scope included. */
function holdingDirectory(packageDirectory: string, name: string): string {
  return path.resolve(packageDirectory, ...name.split('/').map(() => '..'));
}

function isRoot(directory: string): boolean {
  return path.dirname(directory) === directory;
}

function isWithin(directory: string, target: string): boolean {
  const relative = path.relative(directory, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isLink(target: string): boolean {
  return fs.lstatSync(target).isSymbolicLink();
}

function entries(directory: string): string[] {
  try {
    return fs.readdirSync(directory).filter((name) => !name.startsWith('.'));
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

function realPath(target: string): string | undefined {
  try {
    return fs.realpathSync.native(target);
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return (error as { code?: string }).code === 'ENOENT';
}
