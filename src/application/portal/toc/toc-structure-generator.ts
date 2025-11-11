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

type Endpoints = {
  data: Map<string, TocEndpoint[]>;
  expand: boolean;
};

type Webhooks = {
  data: Map<string, TocWebhookPage[]>;
  expand: boolean;
};

type Callbacks = {
  data: Map<string, TocCallbackPage[]>;
  expand: boolean;
};

type Models = {
  data: TocModelPage[];
  expand: boolean;
};

export class TocStructureGenerator {
  createTocStructure(
    endpoints: Endpoints,
    models: Models,
    webhooks: Webhooks,
    callbacks: Callbacks,
    contentGroups: TocGroup[] = []
  ): Toc {
    const events = [...this.getCallbacksSection(callbacks), ...this.getWebhooksSection(webhooks)];

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
        this.getEndpointsSection(endpoints),
        ...(events.length > 0
          ? [
              {
                group: 'Events',
                items: events
              }
            ]
          : []),
        ...this.getModelsSection(models),
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

  private getEndpointsSection(endpoints: Endpoints): TocGroup | TocGenerated {
    if (!endpoints.expand || endpoints.data.size === 0) {
      return {
        generate: 'API Endpoints',
        from: 'endpoints'
      };
    }
    return {
      group: 'API Endpoints',
      items: Array.from(endpoints.data).map(([groupName, endpoints]) => ({
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

  private getCallbacksSection(callbacks: Callbacks): (TocGroup | TocGenerated)[] {
    if (callbacks.data.size === 0) {
      return [];
    }
    if (callbacks.expand === true) {
      if (callbacks.data.size === 1) {
        return [
          {
            group: Array.from(callbacks.data.keys())[0],
            items: Array.from(callbacks.data.values())[0]
          }
        ];
      }
      return [
        {
          group: 'Callbacks',
          items: Array.from(callbacks.data).map(([groupName, eventList]) => ({
            group: groupName,
            items: eventList
          }))
        }
      ];
    }
    return [
      {
        generate: 'Callbacks',
        from: 'callbacks'
      }
    ];
  }

  private getWebhooksSection(webhooks: Webhooks): (TocGroup | TocGenerated)[] {
    if (webhooks.data.size === 0) {
      return [];
    }
    if (webhooks.expand === true) {
      if (webhooks.data.size === 1) {
        return [
          {
            group: Array.from(webhooks.data.keys())[0],
            items: Array.from(webhooks.data.values())[0]
          }
        ];
      }
      return [
        {
          group: 'Webhooks',
          items: Array.from(webhooks.data).map(([groupName, eventList]) => ({
            group: groupName,
            items: eventList
          }))
        }
      ];
    }
    return [
      {
        generate: 'Webhooks',
        from: 'webhooks'
      }
    ];
  }

  private getModelsSection(models: Models): (TocGroup | TocGenerated)[] {
    if (models.data.length === 0) {
      return [];
    }
    if (!models.expand) {
      return [
        {
          generate: 'Models',
          from: 'models'
        }
      ];
    }
    return [
      {
        group: 'Models',
        items: models.data
      }
    ];
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
