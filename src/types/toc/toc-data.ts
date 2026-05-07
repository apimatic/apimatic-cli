import {
  TocEndpoint,
  TocModelPage,
  TocCallback,
  TocWebhook,
  TocWebhookPage,
  TocCallbackPage,
  TocContainerModelPage,
  TocInputModelPage
} from './toc.js';
import { toTitleCase } from '../../utils/string-utils.js';

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

export type EndpointGroup = Map<string, TocEndpoint[]>;
export type WebhookGroup = Map<string, TocWebhookPage[]>;
export type CallbackGroup = Map<string, TocCallbackPage[]>;

export type TocComponents = {
  endpointGroups: EndpointGroup;
  models: TocModelPage[];
  enums: TocModelPage[];
  errors: TocModelPage[];
  containerModels: TocContainerModelPage[];
  inputModels: TocInputModelPage[];
  webhookGroups: WebhookGroup;
  callbackGroups: CallbackGroup;
};

export function extractEndpointGroupsForToc(tocData: TocData): Map<string, TocEndpoint[]> {
  const endpointGroups = new Map<string, TocEndpoint[]>();

  for (const [group, names] of Object.entries(tocData.endpoints)) {
    const endpoints = names.map(
      (name: string): TocEndpoint => ({
        generate: null,
        from: 'endpoint',
        endpointName: name,
        endpointGroup: group
      })
    );
    endpointGroups.set(group, endpoints);
  }

  return endpointGroups;
}

export function extractModelsForToc(tocData: TocData): TocModelPage[] {
  return tocData.models.map(
    (name: string): TocModelPage => ({
      generate: null,
      from: 'model',
      modelName: name
    })
  );
}

export function extractEnumsForToc(tocData: TocData): TocModelPage[] {
  return tocData.enums.map(
    (name: string): TocModelPage => ({
      generate: null,
      from: 'model',
      modelName: name
    })
  );
}

export function extractErrorsForToc(tocData: TocData): TocModelPage[] {
  return tocData.errors.map(
    (name: string): TocModelPage => ({
      generate: null,
      from: 'model',
      modelName: name
    })
  );
}

export function extractContainerModelsForToc(tocData: TocData): TocContainerModelPage[] {
  return tocData.containers.map(
    (name: string): TocContainerModelPage => ({
      generate: null,
      from: 'container',
      containerName: name
    })
  );
}

export function extractInputModelsForToc(tocData: TocData): TocInputModelPage[] {
  return tocData.inputModels.map(
    (m: InputModel): TocInputModelPage => ({
      generate: null,
      from: 'input-model',
      endpointName: m.name,
      endpointGroup: m.group
    })
  );
}

export function extractWebhooksForToc(tocData: TocData): Map<string, TocWebhookPage[]> {
  const groupedWebhooks = new Map<string, TocWebhookPage[]>();

  for (const [group, names] of Object.entries(tocData.webhooks)) {
    const groupTitle = toTitleCase(group);
    groupedWebhooks.set(groupTitle, [
      {
        generate: null,
        from: 'webhook-group-overview',
        webhookGroup: group
      },
      ...names.map(
        (name: string): TocWebhook => ({
          generate: null,
          from: 'webhook',
          webhookName: name,
          webhookGroup: group
        })
      )
    ]);
  }

  return new Map([...groupedWebhooks].sort((a, b) => a[0].localeCompare(b[0])));
}

export function extractCallbacksForToc(tocData: TocData): Map<string, TocCallbackPage[]> {
  const groupedCallbacks = new Map<string, TocCallbackPage[]>();

  for (const [group, names] of Object.entries(tocData.callbacks)) {
    const groupTitle = toTitleCase(group);
    groupedCallbacks.set(groupTitle, [
      {
        generate: null,
        from: 'callback-group-overview',
        callbackGroup: group
      },
      ...names.map(
        (name: string): TocCallback => ({
          generate: null,
          from: 'callback',
          callbackName: name,
          callbackGroup: group
        })
      )
    ]);
  }

  return new Map([...groupedCallbacks].sort((a, b) => a[0].localeCompare(b[0])));
}
