import fs from 'node:fs';
import path from 'node:path';

/**
 * The installations the project's dependencies resolve to. Vite serves a file from outside
 * its allow list only once the module importing it has been transformed, an order a browser
 * cache skips: Safari, holding the importer from an earlier preview on the same port, asked
 * for the TanStack dev entry first and was refused, leaving a blank page. Naming where the
 * links really lead keeps every dependency served whatever the browser asks for first.
 */
export function dependencyDirectories(projectDirectory: string): string[] {
  const directories = new Set<string>();
  for (const packagePath of packagePaths(path.join(projectDirectory, 'node_modules'))) {
    const installed = realPath(packagePath);
    if (installed !== undefined) {
      directories.add(outermostNodeModules(installed));
    }
  }
  return [...directories];
}

function packagePaths(modules: string): string[] {
  return entries(modules).flatMap((name) => {
    const packagePath = path.join(modules, name);
    return name.startsWith('@') ? entries(packagePath).map((scoped) => path.join(packagePath, scoped)) : [packagePath];
  });
}

function entries(directory: string): string[] {
  try {
    return fs.readdirSync(directory).filter((name) => !name.startsWith('.'));
  } catch {
    return [];
  }
}

function realPath(target: string): string | undefined {
  try {
    return fs.realpathSync(target);
  } catch {
    return undefined;
  }
}

/** The widest installation around a package: under pnpm the whole store sits inside one `node_modules` too. */
function outermostNodeModules(packageDirectory: string): string {
  let found = packageDirectory;
  for (let parent = path.dirname(packageDirectory); parent !== path.dirname(parent); parent = path.dirname(parent)) {
    if (path.basename(parent) === 'node_modules') {
      found = parent;
    }
  }
  return found;
}
