import { Flags } from "@oclif/core";

export class FlagsProvider {
  // Common folder flag group
  public static folder = {
    folder: Flags.string({
      description:
        "[default: ./] Path to the parent directory containing the build folder, which includes API specifications and configuration files."
    })
  };

  public static destination = {
    folder: Flags.string({
      char: "d",
      description:
        "[default: ./portal] path where the portal will be downloaded",
    })
  };

  // Auth key group
  public static ["auth-key"] = {
    "auth-key": Flags.string({
      char: "k",
      description: "override current authentication state with an authentication key",
      env: "API_COPILOT_AUTH_KEY"
    })
  };

  public static force = {
    force: Flags.boolean({
      char: "f",
      default: false,
      description: "overwrite if the destination is not empty",
    })
  };
}


