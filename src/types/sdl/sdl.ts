import { TocEndpoint, TocModelPage, TocCallback, TocWebhook, TocWebhookPage, TocCallbackPage } from "../toc/toc.js";
import { toTitleCase, getUniqueGroupName } from "../../utils/utils.js";

export type SdlTocComponents = {
  endpointGroups: Map<string, TocEndpoint[]>;
  models: TocModelPage[];
  webhookGroups: Map<string, TocWebhookPage[]>;
  callbackGroups: Map<string, TocCallbackPage[]>;
};

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
    const event = createTocWebhook(webhook);
    const groupKey = webhook.WebhookGroupName ? toTitleCase(webhook.WebhookGroupName) : null;

    if (groupKey) {
      addToWebhookGroup(webhookGroups, groupKey, webhook.WebhookGroupName ?? null, event);
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

function addToWebhookGroup(
  webhookGroups: Map<string, TocWebhookPage[]>,
  groupKey: string,
  groupName: string | null,
  event: TocWebhook
): void {
  if (!webhookGroups.has(groupKey)) {
    webhookGroups.set(groupKey, [
      {
        generate: null,
        from: "webhook-group-overview",
        webhookGroup: groupName
      }
    ]);
  }
  webhookGroups.get(groupKey)?.push(event);
}

function createTocWebhook(webhook: { Id: string; WebhookGroupName?: string }): TocWebhook {
  return {
    generate: null,
    from: "webhook",
    webhookName: webhook.Id,
    webhookGroup: webhook.WebhookGroupName ?? null
  };
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
      const event = createTocCallback(callback);

      const groupKey = callback.CallbackGroupName ? toTitleCase(callback.CallbackGroupName) : null;

      if (groupKey) {
        addToCallbackGroup(callbackGroups, groupKey, callback.CallbackGroupName ?? null, event);
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

function addToCallbackGroup(
  callbackGroups: Map<string, TocCallbackPage[]>,
  groupKey: string,
  groupName: string | null,
  event: TocCallback
): void {
  if (!callbackGroups.has(groupKey)) {
    callbackGroups.set(groupKey, [
      {
        generate: null,
        from: "callback-group-overview",
        callbackGroup: groupName
      }
    ]);
  }
  callbackGroups.get(groupKey)?.push(event);
}

function createTocCallback(callback: { Id: string, CallbackGroupName: string }): TocCallback {
  return {
    generate: null,
    from: "callback",
    callbackName: callback.Id,
    callbackGroup: callback.CallbackGroupName ?? null
  };
}

function extractModelsForToc(sdl: Sdl): TocModelPage[] {
  return sdl.CustomTypes.map(
    (e: SdlModel): TocModelPage => ({
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
