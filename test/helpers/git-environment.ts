import fs from 'node:fs';
import path from 'node:path';

/** `name` set to `value` for a test; answers the call that puts it back as it was. */
export function withEnvironment(name: string, value: string): () => void {
  const previous = process.env[name];
  process.env[name] = value;
  return () => {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  };
}

/** An empty global git config in `directory`, so a developer's own `core.hooksPath` cannot move the hooks a test writes; answers the restore. */
export function emptyGlobalGitConfig(directory: string): () => void {
  const file = path.join(directory, 'gitconfig');
  fs.writeFileSync(file, '');
  return withEnvironment('GIT_CONFIG_GLOBAL', file);
}

/** `directory` as the home directory git expands `~` to; answers the restore. */
export function withHome(directory: string): () => void {
  return withEnvironment('HOME', directory);
}
