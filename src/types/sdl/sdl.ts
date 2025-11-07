import { TocEndpoint, TocModelPage, TocCallback, TocWebhook, TocWebhookPage, TocCallbackPage } from '../toc/toc.js';
import { toTitleCase } from '../../utils/string-utils.js';

export type EndpointGroup = Map<string, TocEndpoint[]>;
export type WebhookGroup = Map<string, TocWebhookPage[]>;
export type CallbackGroup = Map<string, TocCallbackPage[]>;

export type SdlTocComponents = {
  endpointGroups: EndpointGroup;
  models: TocModelPage[];
  webhookGroups: WebhookGroup;
  callbackGroups: CallbackGroup;
};

export interface Sdl {
  readonly Endpoints: SdlEndpoint[];
  readonly CustomTypes: SdlModel[];
  readonly Webhooks: SdlWebhook[];
}

export interface SdlEndpoint {
  readonly Name: string;
  readonly Description: string;
  readonly Group: string;
  readonly Callbacks: SdlCallback[];
}

export interface SdlModel {
  readonly Name: string;
}

export interface SdlCallback {
  readonly Id: string;
  readonly CallbackGroupName?: string;
}

export interface SdlWebhook {
  readonly Id: string;
  readonly WebhookGroupName?: string;
}

export function getEndpointDescription(
  endpointGroups: Map<string, SdlEndpoint[]>,
  endpointGroupName: string,
  endpointName: string
): string {
  return endpointGroups.get(endpointGroupName)!.find((e) => e.Name === endpointName)!.Description;
}

export function getEndpointGroupsFromSdl(sdl: Sdl): Map<string, SdlEndpoint[]> {
  const endpointGroups = new Map<string, SdlEndpoint[]>();
  for (const endpoint of sdl.Endpoints) {
    if (!endpointGroups.has(endpoint.Group)) {
      endpointGroups.set(endpoint.Group, []);
    }

    endpointGroups.get(endpoint.Group)!.push({
      Name: endpoint.Name,
      Description: endpoint.Description,
      Group: endpoint.Group,
      Callbacks: endpoint.Callbacks
    });
  }
  return endpointGroups;
}

export function extractEndpointGroupsForToc(sdl: Sdl): Map<string, TocEndpoint[]> {
  const endpointGroups = new Map<string, TocEndpoint[]>();

  const endpoints = sdl.Endpoints.map(
    (e: SdlEndpoint): TocEndpoint => ({
      generate: null,
      from: 'endpoint',
      endpointName: e.Name,
      endpointGroup: e.Group
    })
  );

  endpoints.forEach((endpoint: TocEndpoint) => {
    const group = endpoint.endpointGroup;
    if (!endpointGroups.has(group)) {
      endpointGroups.set(group, []);
    }
    endpointGroups.get(group)!.push(endpoint);
  });

  return endpointGroups;
}

export function extractModelsForToc(sdl: Sdl): TocModelPage[] {
  return sdl.CustomTypes.map(
    (e: SdlModel): TocModelPage => ({
      generate: null,
      from: 'model',
      modelName: e.Name
    })
  );
}

export function extractWebhooksForToc(sdl: Sdl): Map<string, TocWebhookPage[]> {
  if (sdl.Webhooks.length === 0) {
    return new Map();
  }

  let groupedWebhooks = new Map<string, TocWebhookPage[]>();
  const ungrouped: TocWebhook[] = [];

  for (const webhook of sdl.Webhooks) {
    const event: TocWebhook = {
      generate: null,
      from: 'webhook',
      webhookName: webhook.Id,
      webhookGroup: webhook.WebhookGroupName ?? null
    };

    if (webhook.WebhookGroupName) {
      const groupTitle = toTitleCase(webhook.WebhookGroupName);
      if (!groupedWebhooks.has(groupTitle)) {
        groupedWebhooks.set(groupTitle, [
          {
            generate: null,
            from: 'webhook-group-overview',
            webhookGroup: webhook.WebhookGroupName
          }
        ]);
      }
      groupedWebhooks.get(groupTitle)!.push(event);
    } else {
      ungrouped.push(event);
    }
  }

  let ungroupedWebhooks = new Map<string, TocWebhookPage[]>();

  if (ungrouped.length > 0) {
    const uniqueGroupName = getUniqueGroupName('Webhooks', new Set(groupedWebhooks.keys()));
    const uniqueGroupTitle = toTitleCase(uniqueGroupName);
    ungroupedWebhooks.set(uniqueGroupTitle, [
      {
        generate: null,
        from: 'webhook-group-overview',
        webhookGroup: uniqueGroupName
      },
      ...ungrouped.map(
        (event): TocWebhook => ({
          ...event,
          webhookGroup: uniqueGroupName
        })
      )
    ]);
  }

  return new Map([...[...groupedWebhooks].sort((a, b) => a[0].localeCompare(b[0])), ...ungroupedWebhooks]);
}

export function extractCallbacksForToc(sdl: Sdl): Map<string, TocCallbackPage[]> {
  if (sdl.Endpoints.length === 0) {
    return new Map();
  }

  let groupedCallbacks = new Map<string, TocCallbackPage[]>();
  const ungrouped: TocCallback[] = [];

  for (const callback of sdl.Endpoints.flatMap((e) => e.Callbacks)) {
    const event: TocCallback = {
      generate: null,
      from: 'callback',
      callbackName: callback.Id,
      callbackGroup: callback.CallbackGroupName ?? null
    };

    if (callback.CallbackGroupName) {
      const groupTitle = toTitleCase(callback.CallbackGroupName);
      if (!groupedCallbacks.has(groupTitle)) {
        groupedCallbacks.set(groupTitle, [
          {
            generate: null,
            from: 'callback-group-overview',
            callbackGroup: callback.CallbackGroupName
          }
        ]);
      }
      groupedCallbacks.get(groupTitle)!.push(event);
    } else {
      ungrouped.push(event);
    }
  }

  let ungroupedCallbacks = new Map<string, TocCallbackPage[]>();

  if (ungrouped.length > 0) {
    const uniqueGroupName = getUniqueGroupName('Callbacks', new Set(groupedCallbacks.keys()));
    const uniqueGroupTitle = toTitleCase(uniqueGroupName);
    ungroupedCallbacks.set(uniqueGroupTitle, [
      {
        generate: null,
        from: 'callback-group-overview',
        callbackGroup: uniqueGroupName
      },
      ...ungrouped.map(
        (event): TocCallback => ({
          ...event,
          callbackGroup: uniqueGroupName
        })
      )
    ]);
  }

  return new Map([...[...groupedCallbacks].sort((a, b) => a[0].localeCompare(b[0])), ...ungroupedCallbacks]);
}

function getUniqueGroupName(baseName: string, existingGroups: Set<string>): string {
  let counter = 1;
  let name = baseName;

  while (existingGroups.has(toTitleCase(name))) {
    name = `${baseName}${counter}`;
    counter++;
  }

  return name;
}
