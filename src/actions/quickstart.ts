import { QuickstartPrompts } from '../prompts/quickstart.js';
import { CommandMetadata } from '../types/common/command-metadata.js';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { ActionResult } from './action-result.js';
import { PortalQuickstartAction } from './portal/quickstart.js';

export class QuickstartAction {
  private readonly prompts = new QuickstartPrompts();

  public constructor(private readonly configDir: DirectoryPath, private readonly commandMetadata: CommandMetadata) {}

  public readonly execute = async (): Promise<ActionResult> => {
    this.prompts.welcomeMessage();

    return await new PortalQuickstartAction(this.configDir, this.commandMetadata).execute();
  };
}
