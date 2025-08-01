import { Flags } from "@oclif/core";

export class FlagsProvider {
  private static readonly inputFlagName: string = "input" as const;
  // Common folder flag group
  public static input = {
    [FlagsProvider.inputFlagName]: Flags.string({
      char: "i",
      description:
        "[default: ./] path to the parent directory containing the 'src' directory, which includes API specifications and configuration files."
    })
  };

  public static destination(artifact: string, artifactName: string) {
    return {
      destination: Flags.string({
        char: "d",
        description: `[default: <${FlagsProvider.inputFlagName}>/${artifact}] path where the ${artifactName} will be generated.`
      })
    };
  }

  // Auth key group
  public static authKey = {
    "auth-key": Flags.string({
      char: "k",
      description: "override current authentication state with an authentication key."
    })
  };

  public static force = {
    force: Flags.boolean({
      char: "f",
      default: false,
      description: "overwrite changes without asking for user consent."
    })
  };
}
