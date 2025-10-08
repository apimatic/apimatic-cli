import { TocEndpoint, TocModel, TocCallback, TocWebhook, TocWebhookPage, TocCallbackPage } from "../toc/toc.js";
import { toTitleCase, getUniqueGroupName } from "../../utils/utils.js";
export type EndpointGroup = Map<string, TocEndpoint[]>;
export type SdlTocComponents = { endpointGroups: EndpointGroup; models: TocModel[]; webhookGroups: Map<string, TocWebhookPage[]>; callbackGroups: Map<string, TocCallbackPage[]>; };

export interface Sdl {
  readonly Endpoints: SdlEndpoint[];
  readonly CustomTypes: SdlModel[];
  readonly Webhooks: SdlEvent[];
}

export interface SdlEndpoint {
  readonly Name: string;
  readonly Description: string;
  readonly Group: string;
  readonly Callbacks?: { Id: string, CallbackGroupName: string }[];
}

export interface SdlModel {
  readonly Name: string;
}

export interface SdlEvent {
  readonly Id: string;
  readonly WebhookGroupName?: string;
}

function extractEndpointGroupsForToc(sdl: Sdl): Map<string, TocEndpoint[]> {
  const endpointGroups = new Map<string, TocEndpoint[]>();

  const endpoints = sdl.Endpoints.map(
    (e: SdlEndpoint): TocEndpoint => ({
      generate: null,
      from: "endpoint",
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

function extractWebhooksForToc(sdl: Sdl): Map<string, TocWebhookPage[]> {
  if (sdl.Webhooks.length === 0) {
    return new Map();
  }

  let webhookGroups = new Map<string, TocWebhookPage[]>();
  const ungrouped: TocWebhookPage[] = [];

  for (const webhook of sdl.Webhooks) {
    const event: TocWebhook = {
      generate: null,
      from: "webhook",
      webhookName: webhook.Id,
      webhookGroup: webhook.WebhookGroupName ?? null
    };

    const groupKey = webhook.WebhookGroupName ? toTitleCase(webhook.WebhookGroupName) : null;

    if (groupKey) {
      if (!webhookGroups.has(groupKey)) {
        webhookGroups.set(groupKey, [
          {
            generate: null,
            from: "webhook-group-overview",
            webhookGroup: webhook.WebhookGroupName ?? null
          }
        ]);
      }
      webhookGroups.get(groupKey)?.push(event);
    } else {
      ungrouped.push(event);
    }
  }

  webhookGroups = new Map(
    [...webhookGroups].sort((a, b) => a[0].localeCompare(b[0]))
  );

  if (ungrouped.length > 0) {
    const uniqueGroupName = getUniqueGroupName("Webhooks", webhookGroups);
    const uniqueGroupNameFormatted = toTitleCase(uniqueGroupName);

    webhookGroups.set(uniqueGroupNameFormatted, [
      {
        generate: null,
        from: "webhook-group-overview",
        webhookGroup: uniqueGroupName
      }
    ]);
    for (const ungroupedEvent of ungrouped) {
      ungroupedEvent.webhookGroup = uniqueGroupName;
      webhookGroups.get(uniqueGroupNameFormatted)?.push(ungroupedEvent);
    }
  }

  return webhookGroups;
}

function extractCallbacksForToc(sdl: Sdl): Map<string, TocCallbackPage[]> {
  if (sdl.Endpoints.length === 0) {
    return new Map();
  }

  let callbackGroups = new Map<string, TocCallbackPage[]>();
  const ungrouped: TocCallbackPage[] = [];

  for (const endpoint of sdl.Endpoints) {
    if (!endpoint.Callbacks || endpoint.Callbacks.length === 0) {
      continue;
    }

    for (const callback of endpoint.Callbacks) {
      const event: TocCallback = {
        generate: null,
        from: "callback",
        callbackName: callback.Id,
        callbackGroup: callback.CallbackGroupName ?? null
      };

      const groupKey = callback.CallbackGroupName ? toTitleCase(callback.CallbackGroupName) : null;

      if (groupKey) {
        if (!callbackGroups.has(groupKey)) {
          callbackGroups.set(groupKey, [
            {
              generate: null,
              from: "callback-group-overview",
              callbackGroup: callback.CallbackGroupName ?? null
            }
          ]);
        }
        callbackGroups.get(groupKey)?.push(event);
      } else {
        ungrouped.push(event);
      }
    }
  }

  callbackGroups = new Map(
    [...callbackGroups].sort((a, b) => a[0].localeCompare(b[0]))
  );

  if (ungrouped.length > 0) {
    const uniqueGroupName = getUniqueGroupName("Callbacks", callbackGroups);
    const uniqueGroupNameFormatted = toTitleCase(uniqueGroupName);

    callbackGroups.set(uniqueGroupNameFormatted, [
      {
        generate: null,
        from: "callback-group-overview",
        callbackGroup: uniqueGroupName
      }
    ]);
    for (const ungroupedEvent of ungrouped) {
      ungroupedEvent.callbackGroup = uniqueGroupName;
      callbackGroups.get(uniqueGroupNameFormatted)?.push(ungroupedEvent);
    }
  }
  return callbackGroups;
}

function extractModelsForToc(sdl: Sdl): TocModel[] {
  return sdl.CustomTypes.map(
    (e: SdlModel): TocModel => ({
      generate: null,
      from: "model",
      modelName: e.Name
    })
  );
}

export function getSdlTocComponents(sdl: Sdl): SdlTocComponents {
  const endpointGroups = extractEndpointGroupsForToc(sdl);
  const models = extractModelsForToc(sdl);
  const webhookGroups = extractWebhooksForToc(sdl);
  const callbackGroups = extractCallbacksForToc(sdl);
  return { endpointGroups, models, webhookGroups, callbackGroups };
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
      Group: endpoint.Group
    });
  }
  return endpointGroups;
}
