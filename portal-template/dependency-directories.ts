import fs from 'node:fs';
import path from 'node:path';

// Safari runs a cached entry before its importer is transformed (apimatic-io#2287).
export function dependencyDirectories(portalProjectDirectory: string): string[] {
  const modules = path.join(portalProjectDirectory, 'node_modules');
  const installations = packageNames(modules)
    .filter((name) => isLink(path.join(modules, name)))
    .flatMap((name) => {
      const installed = realPath(path.join(modules, name));
      return installed === undefined ? [] : [holdingDirectory(installed, name)];
    });
  const [first, ...others] = installations;
  return first === undefined ? [] : [others.reduce(commonDirectory, first)];
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

/** The narrowest directory holding both; over them all, the CLI's own `node_modules` under npm, the store under pnpm. */
function commonDirectory(common: string, directory: string): string {
  let candidate = common;
  while (!isWithin(candidate, directory) && path.dirname(candidate) !== candidate) {
    candidate = path.dirname(candidate);
  }
  return candidate;
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
