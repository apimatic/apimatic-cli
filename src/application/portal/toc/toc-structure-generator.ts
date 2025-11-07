import { stringify } from 'yaml';
import {
  Toc,
  TocGroup,
  TocEndpointGroupOverview,
  TocModelPage,
  TocGenerated,
  TocCallbackPage,
  TocWebhookPage,
  TocEndpoint
} from '../../../types/toc/toc.js';

// TODO: Refactor

export class TocStructureGenerator {
  createTocStructure(
    endpointGroups: Map<string, TocEndpoint[]>,
    models: TocModelPage[],
    webhookGroups: Map<string, TocWebhookPage[]>,
    callbackGroups: Map<string, TocCallbackPage[]>,
    contentGroups: TocGroup[] = []
  ): Toc {
    return {
      toc: [
        {
          group: 'Getting Started',
          items: [
            {
              generate: 'How to Get Started',
              from: 'getting-started'
            }
          ]
        },
        ...contentGroups,
        this.getEndpointsSection(endpointGroups),
        {
          group: 'Events',
          items: [this.getCallbacksSection(callbackGroups), this.getWebhooksSection(webhookGroups)]
        },
        this.getModelsSection(models),
        {
          generate: 'SDK Infrastructure',
          from: 'sdk-infra'
        }
      ]
    };
  }

  transformToYaml(toc: Toc): string {
    const transformedToc = this.transformKeys(toc);
    return stringify(transformedToc, {
      indent: 2,
      nullStr: ''
    });
  }

  private getEndpointsSection(endpointGroups: Map<string, TocEndpoint[]>): TocGroup | TocGenerated {
    if (endpointGroups.size === 0) {
      return {
        generate: 'API Endpoints',
        from: 'endpoints'
      };
    }
    return {
      group: 'API Endpoints',
      items: Array.from(endpointGroups).map(([groupName, endpoints]) => ({
        group: groupName,
        items: [
          {
            generate: null,
            from: 'endpoint-group-overview',
            endpointGroup: groupName
          } as TocEndpointGroupOverview,
          ...endpoints
        ]
      }))
    };
  }

  private getCallbacksSection(callbackGroups: Map<string, TocCallbackPage[]>): TocGroup | TocGenerated {
    if (callbackGroups.size === 0) {
      return {
        generate: null,
        from: 'callbacks'
      };
    }
    if (callbackGroups.size === 1) {
      return {
        group: Array.from(callbackGroups.keys())[0],
        items: Array.from(callbackGroups.values())[0]
      };
    }
    return {
      group: 'Callbacks',
      items: Array.from(callbackGroups).map(([groupName, eventList]) => ({
        group: groupName,
        items: eventList
      }))
    };
  }

  private getWebhooksSection(webhookGroups: Map<string, TocWebhookPage[]>): TocGroup | TocGenerated {
    if (webhookGroups.size === 0) {
      return {
        generate: null,
        from: 'webhooks'
      };
    }
    if (webhookGroups.size === 1) {
      return {
        group: Array.from(webhookGroups.keys())[0],
        items: Array.from(webhookGroups.values())[0]
      };
    }
    return {
      group: 'Webhooks',
      items: Array.from(webhookGroups).map(([groupName, eventList]) => ({
        group: groupName,
        items: eventList
      }))
    };
  }

  private getModelsSection(models: TocModelPage[]): TocGroup | TocGenerated {
    if (models.length === 0) {
      return {
        generate: 'Models',
        from: 'models'
      };
    }
    return {
      group: 'Models',
      items: models
    };
  }

  private transformKeys(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.transformKeys(item));
    }
    if (obj !== null && typeof obj === 'object') {
      return Object.fromEntries(
        Object.entries(obj).map(([key, value]) => [
          key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase(),
          this.transformKeys(value)
        ])
      );
    }
    return obj;
  }
}
