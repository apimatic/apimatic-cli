import { DirectoryPath } from "../../types/file/directoryPath.js";
import { ActionResult } from "../action-result.js";
import { CommandMetadata } from "../../types/common/command-metadata.js";
import { Language } from "../../types/sdk/generate.js";
import { PublishType } from "../../types/sdk/publish.js";

export class PublishAction {
  private readonly configDir: DirectoryPath;
  private readonly commandMetadata: CommandMetadata;
  private readonly authKey: string | null;

  constructor(configDir: DirectoryPath, commandMetadata: CommandMetadata, authKey: string | null = null) {
    this.configDir = configDir;
    this.commandMetadata = commandMetadata;
    this.authKey = authKey;
  }

  public readonly executeInteractive = async (
    sdkDirectory: DirectoryPath,
    force: boolean
  ): Promise<ActionResult> => {
    // TODO: implement
    throw new Error("Not implemented");
  };

  public readonly executeNonInteractive = async (
    sdkDirectory: DirectoryPath,
    profileId: string,
    language: Language,
    version: string,
    publishTypes: PublishType[],
    force: boolean,
    dryRun: boolean
  ): Promise<ActionResult> => {
    // TODO: implement
    throw new Error("Not implemented");
  };
}
