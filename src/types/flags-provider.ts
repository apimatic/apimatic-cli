import { Flags } from "@oclif/core";

export class FlagsProvider {

  // Common folder flag group
  public static folder = {
    folder: Flags.string({
      char: 'f',
      description:  "[default: ./] Path to the parent directory containing the build folder, which includes API specifications and configuration files."
    }),
  };

  // Auth key group
  public static ['auth-key'] = {
    'auth-key': Flags.string({
      char: 'k',
      description: "override current authentication state with an authentication key",
      env: 'API_COPILOT_AUTH_KEY',
    }),
  };
}
