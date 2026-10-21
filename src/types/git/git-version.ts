const REQUIRED = { major: 2, minor: 38 } as const;

/** The version of the git on PATH, as `git --version` reports it. */
export class GitVersion {
  private readonly major: number;
  private readonly minor: number;
  private readonly patch: number;

  private constructor(major: number, minor: number, patch: number) {
    this.major = major;
    this.minor = minor;
    this.patch = patch;
  }

  /** From the output of `git --version`, such as `git version 2.47.1.windows.1`. */
  public static parse(output: string): GitVersion | undefined {
    const match = /git version (\d+)\.(\d+)(?:\.(\d+))?/.exec(output);
    return match === null ? undefined : new GitVersion(Number(match[1]), Number(match[2]), Number(match[3] ?? 0));
  }

  /** 2.38 brought `merge-tree --write-tree`, which the merge is built on. */
  public isSupported(): boolean {
    return this.major > REQUIRED.major || (this.major === REQUIRED.major && this.minor >= REQUIRED.minor);
  }

  public static required(): string {
    return `${REQUIRED.major}.${REQUIRED.minor}`;
  }

  public toString(): string {
    return `${this.major}.${this.minor}.${this.patch}`;
  }
}
