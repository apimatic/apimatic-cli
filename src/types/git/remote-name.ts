/** A remote as git's configuration names it, such as `origin`; a URL set as a branch's remote counts too. */
export class RemoteName {
  private readonly name: string;

  private constructor(name: string) {
    this.name = name;
  }

  /** From git's configuration or its remote listing; none for an empty name or one git would refuse. */
  public static fromGit(name: string): RemoteName | undefined {
    return name !== '' && !/\s/.test(name) ? new RemoteName(name) : undefined;
  }

  /** The remote a clone is given, which a run falls back to when the branch names none. */
  public static origin(): RemoteName {
    return new RemoteName('origin');
  }

  public isEqual(other: RemoteName): boolean {
    return this.name === other.name;
  }

  public toString(): string {
    return this.name;
  }
}
