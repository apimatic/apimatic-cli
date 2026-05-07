import { stringify } from 'yaml';
import {
  Toc,
  TocGroup,
  TocGenerated,
  TocModelPage,
  TocContainerModelPage,
  TocInputModelPage,
} from '../../../types/toc/toc.js';
import { 
  TocComponents,
  EndpointGroups,
  WebhookGroups,
  CallbackGroups 
} from '../../../types/toc/toc-components.js';

export class TocStructureGenerator {
  createTocStructure(
    tocComponents: TocComponents,
    expandEndpoints: boolean,
    expandModels: boolean,
    expandWebhooks: boolean,
    expandCallbacks: boolean,
    contentGroups: TocGroup[] = []
  ): Toc {
    const events = [
      ...this.getCallbacksSection(tocComponents.callbackGroups, expandCallbacks),
      ...this.getWebhooksSection(tocComponents.webhookGroups, expandWebhooks)
    ];

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
        this.getEndpointsSection(tocComponents.endpointGroups, expandEndpoints),
        ...(events.length > 0
          ? [
              {
                group: 'Events',
                items: events
              }
            ]
          : []),
        ...this.getModelsSection(
          tocComponents.models,
          tocComponents.enums,
          tocComponents.errors,
          tocComponents.containerModels,
          tocComponents.inputModels,
          expandModels
        ),
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

  private getEndpointsSection(data: EndpointGroups, expand: boolean): TocGroup | TocGenerated {
    if (!expand || data.size === 0) {
      return {
        generate: 'API Endpoints',
        from: 'endpoints'
      };
    }
    return {
      group: 'API Endpoints',
      items: Array.from(data).map(([groupName, pages]) => ({
        group: groupName,
        items: pages
      }))
    };
  }

  private getCallbacksSection(data: CallbackGroups, expand: boolean): (TocGroup | TocGenerated)[] {
    if (data.size === 0) {
      return [];
    }
    if (expand === true) {
      if (data.size === 1) {
        return [
          {
            group: Array.from(data.keys())[0],
            items: Array.from(data.values())[0]
          }
        ];
      }
      return [
        {
          group: 'Callbacks',
          items: Array.from(data).map(([groupName, eventList]) => ({
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

  private getWebhooksSection(data: WebhookGroups, expand: boolean): (TocGroup | TocGenerated)[] {
    if (data.size === 0) {
      return [];
    }
    if (expand === true) {
      if (data.size === 1) {
        return [
          {
            group: Array.from(data.keys())[0],
            items: Array.from(data.values())[0]
          }
        ];
      }
      return [
        {
          group: 'Webhooks',
          items: Array.from(data).map(([groupName, eventList]) => ({
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

  private getModelsSection(
    modelsData: TocModelPage[],
    enumsData: TocModelPage[],
    errorsData: TocModelPage[],
    containerModelsData: TocContainerModelPage[],
    inputModelsData: TocInputModelPage[],
    expand: boolean
  ): (TocGroup | TocGenerated)[] {
    if (
      modelsData.length === 0 &&
      enumsData.length === 0 &&
      errorsData.length === 0 &&
      containerModelsData.length === 0 &&
      inputModelsData.length === 0
    ) {
      return [];
    }
    if (!expand) {
      return [
        {
          generate: 'Models',
          from: 'models'
        }
      ];
    }
    const subGroups: TocGroup[] = [
      ...(modelsData.length > 0 || inputModelsData.length > 0
        ? [{ group: 'Structures', items: [...modelsData, ...inputModelsData] }]
        : []),
      ...(enumsData.length > 0 ? [{ group: 'Enumerations', items: enumsData }] : []),
      ...(errorsData.length > 0 ? [{ group: 'Exceptions', items: errorsData }] : []),
      ...(containerModelsData.length > 0
        ? [{ group: 'OneOf/AnyOf Definitions', items: containerModelsData }]
        : [])
    ];
    return [
      {
        group: 'Models',
        items: subGroups
      }
    ];
  }

  private transformKeys(obj: unknown): unknown {
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
