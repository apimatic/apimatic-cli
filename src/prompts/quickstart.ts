import { isCancel, log, select } from '@clack/prompts';

export type QuickstartFlow = 'sdk' | 'portal' | undefined;

export class QuickstartPrompts {
  public welcomeMessage() {
    log.info(`Welcome to the APIMatic quickstart wizard.`);
    log.message(`This wizard will guide you through creating your first API Documentation Portal or SDK.
Let's get started!`);
  }

  public async selectQuickstartFlow(): Promise<QuickstartFlow> {
    const option = await select({
      message: 'How do you want to get started?',
      options: [
        { value: 'portal', label: 'API Portal', hint: 'Built on this machine from your OpenAPI definition' },
        { value: 'sdk', label: 'SDK', hint: 'Generate an SDK and its context plugins' }
      ]
    });

    if (isCancel(option)) {
      return undefined;
    }

    return option;
  }

  public noQuickstartFlowSelected() {
    log.error('No option was selected.');
  }
}
