const REQUIRED = { major: 2, minor: 38 } as const;

type Parts = { readonly major: number; readonly minor: number; readonly patch: number };

/** The version of the git on PATH as `git --version` reports it, or none. */
export class GitVersion {
  private static readonly NONE = new GitVersion(undefined);

  private constructor(private readonly parts: Parts | undefined) {}

  /** From the output of `git --version`, such as `git version 2.47.1.windows.1`; none for anything else. */
  public static parse(output: string): GitVersion {
    const match = /git version (\d+)\.(\d+)(?:\.(\d+))?/.exec(output);
    return match === null
      ? GitVersion.NONE
      : new GitVersion({ major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3] ?? 0) });
  }

  /** No git for this run: none on PATH, one that does not answer, or one that was not looked for. */
  public static none(): GitVersion {
    return GitVersion.NONE;
  }

  public isFound(): boolean {
    return this.parts !== undefined;
  }

  /** 2.38 brought `merge-tree --write-tree`, which keeping edits across regenerations is built on; none supports nothing. */
  public isSupported(): boolean {
    return (
      this.parts !== undefined &&
      (this.parts.major > REQUIRED.major || (this.parts.major === REQUIRED.major && this.parts.minor >= REQUIRED.minor))
    );
  }

  public static required(): string {
    return `${REQUIRED.major}.${REQUIRED.minor}`;
  }

  public toString(): string {
    return this.parts === undefined ? 'none' : `${this.parts.major}.${this.parts.minor}.${this.parts.patch}`;
  }
}
