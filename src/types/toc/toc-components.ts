import {
  TocEndpoint,
  TocEndpointPage,
  TocModelPage,
  TocCallback,
  TocWebhook,
  TocWebhookPage,
  TocCallbackPage,
  TocContainerModelPage,
  TocInputModelPage
} from './toc.js';

export interface InputModel {
  readonly name: string;
  readonly group: string;
}

export interface TocData {
  readonly endpoints: Record<string, string[]>;
  readonly models: string[];
  readonly enums: string[];
  readonly errors: string[];
  readonly webhooks: Record<string, string[]>;
  readonly callbacks: Record<string, string[]>;
  readonly containers: string[];
  readonly inputModels: InputModel[];
}

export type EndpointGroups = Map<string, TocEndpointPage[]>;
export type WebhookGroups = Map<string, TocWebhookPage[]>;
export type CallbackGroups = Map<string, TocCallbackPage[]>;

export class TocComponents {
  readonly endpointGroups: EndpointGroups;
  readonly models: TocModelPage[];
  readonly enums: TocModelPage[];
  readonly errors: TocModelPage[];
  readonly containerModels: TocContainerModelPage[];
  readonly inputModels: TocInputModelPage[];
  readonly webhookGroups: WebhookGroups;
  readonly callbackGroups: CallbackGroups;

  private constructor(
    endpointGroups: EndpointGroups,
    models: TocModelPage[],
    enums: TocModelPage[],
    errors: TocModelPage[],
    containerModels: TocContainerModelPage[],
    inputModels: TocInputModelPage[],
    webhookGroups: WebhookGroups,
    callbackGroups: CallbackGroups
  ) {
    this.endpointGroups = endpointGroups;
    this.models = models;
    this.enums = enums;
    this.errors = errors;
    this.containerModels = containerModels;
    this.inputModels = inputModels;
    this.webhookGroups = webhookGroups;
    this.callbackGroups = callbackGroups;
  }

  static empty(): TocComponents {
    return new TocComponents(new Map(), [], [], [], [], [], new Map(), new Map());
  }

  static fromTocData(tocData: TocData): TocComponents {
    return new TocComponents(
      TocComponents.toEndpointGroups(tocData.endpoints),
      TocComponents.toTocModelPages(tocData.models),
      TocComponents.toTocModelPages(tocData.enums),
      TocComponents.toTocModelPages(tocData.errors),
      TocComponents.toTocContainerModelPages(tocData.containers),
      TocComponents.toTocInputModelPages(tocData.inputModels),
      TocComponents.toWebhookGroups(tocData.webhooks),
      TocComponents.toCallbackGroups(tocData.callbacks)
    );
  }

  private static toEndpointGroups(endpoints: Record<string, string[]>): EndpointGroups {
    return new Map(
      Object.entries(endpoints).map(([group, names]) => [
        group,
        [
          { 
            generate: null,
            from: 'endpoint-group-overview',
            endpointGroup: group 
          },
          ...names.map((name): TocEndpoint => ({ 
            generate: null,
            from: 'endpoint',
            endpointName: name,
            endpointGroup: group
          }))
        ]
      ])
    );
  }

  private static toTocModelPages(models: string[]): TocModelPage[] {
    return models.map(
      (name: string): TocModelPage => ({
        generate: null,
        from: 'model',
        modelName: name
      })
    );
  }

  private static toTocContainerModelPages(containers: string[]): TocContainerModelPage[] {
    return containers.map(
      (name: string): TocContainerModelPage => ({
        generate: null,
        from: 'container',
        containerName: name
      })
    );
  }

  private static toTocInputModelPages(inputModels: InputModel[]): TocInputModelPage[] {
    return inputModels.map(
      (m: InputModel): TocInputModelPage => ({
        generate: null,
        from: 'input-model',
        endpointName: m.name,
        endpointGroup: m.group
      })
    );
  }

  private static toWebhookGroups(webhooks: Record<string, string[]>): WebhookGroups {
    return new Map(
      Object.entries(webhooks)
        .map(([group, names]): [string, TocWebhookPage[]] => [
          group,
          [
            { 
              generate: null,
              from: 'webhook-group-overview',
              webhookGroup: group
            },
            ...names.map((name): TocWebhook => ({
              generate: null,
              from: 'webhook',
              webhookName: name,
              webhookGroup: group
            }))
          ]
        ])
    );
  }

  private static toCallbackGroups(callbacks: Record<string, string[]>): CallbackGroups {
    return new Map(
      Object.entries(callbacks)
        .map(([group, names]): [string, TocCallbackPage[]] => [
          group,
          [
            { 
              generate: null,
              from: 'callback-group-overview',
              callbackGroup: group
            },
            ...names.map((name): TocCallback => ({
              generate: null,
              from: 'callback',
              callbackName: name,
              callbackGroup: group
            }))
          ]
        ])
    );
  }
}
