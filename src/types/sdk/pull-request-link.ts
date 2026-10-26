const GITHUB_REMOTE = /^(?:https?:\/\/(?:[^@/]+@)?|git@|ssh:\/\/git@)github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i;

export type ConflictBranches = { yours: string; generated: string };

export function conflictBranches(at: Date): ConflictBranches {
  const stamp = at
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, '');
  return { yours: `apimatic/conflict/${stamp}`, generated: `apimatic/generated/${stamp}` };
}

export function compareUrl(remoteUrl: string, branches: ConflictBranches): string | undefined {
  const match = GITHUB_REMOTE.exec(remoteUrl.trim());
  if (match === null) {
    return undefined;
  }
  const [, owner, repo] = match;
  return `https://github.com/${owner}/${repo}/compare/${branches.yours}...${branches.generated}?expand=1`;
}
