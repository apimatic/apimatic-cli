import { log } from "@clack/prompts";
import { UnallowedFeaturesResponse } from "../../infrastructure/services/validation-service.js";

export class stripPrompts {
  public splitSpecDetected(unallowed: UnallowedFeaturesResponse): void {
    const featuresList = unallowed.Features.map((f) => `  • ${f}`).join('\n');

    let endpointMessage = '';
    if (unallowed.EndpointLimit < unallowed.EndpointCount) {
      endpointMessage = `\nEndpoint limit exceeded: ${unallowed.EndpointCount} endpoints found, but your plan allows ${unallowed.EndpointLimit}\n`;
    }

    const message = [
      'Your API Specification includes components not available on your current subscription plan:',
      '',
      featuresList,
      endpointMessage,
      'To continue:',
      '- Remove these components from your API Specification and re-run this command.',
      '- Combine your split API Specification files into a single file. We can automatically remove unsupported components from single-file specs.',
      '- Upgrade your subscription to unlock additional features: https://www.apimatic.io/pricing'
    ].join('\n');

    log.info(message);
  }

  public stripUnallowedFeaturesStep(unallowed: UnallowedFeaturesResponse): void {
    const featuresList = unallowed.Features.map((f) => `  • ${f}`).join('\n');

    let endpointMessage = '';
    if (unallowed.EndpointLimit < unallowed.EndpointCount) {
      const endpointsToRemove = unallowed.EndpointCount - unallowed.EndpointLimit;
      endpointMessage = `\n${endpointsToRemove} endpoint(s) will be removed from your spec\n`;
    }

    const message = [
      'Your API Specification includes components not available on your current subscription plan.',
      "We'll automatically remove these components before proceeding:",
      featuresList,
      endpointMessage,
      '',
      "You won't see these components in the generated SDKs or documentation.",
      'Want to keep them? Upgrade your subscription to unlock additional features: https://www.apimatic.io/pricing'
    ].join('\n');

    log.info(message);
  }
}
