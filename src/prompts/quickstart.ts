import { log } from '@clack/prompts';

export class QuickstartPrompts {
  public welcomeMessage() {
    log.message(`This wizard will walk you through creating your API Documentation
Portal, SDKs and Context Plugins.
Let's get started!`);
  }
}
