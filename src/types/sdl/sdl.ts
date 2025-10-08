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
  const ungrouped: TocWebhook[] = [];

  for (const webhook of sdl.Webhooks) {
    const event = createTocWebhook(webhook);

    if (webhook.WebhookGroupName) {
      addToWebhookGroup(webhookGroups, webhook.WebhookGroupName, event);
    } else {
      ungrouped.push(event);
    }
  }

  webhookGroups = new Map(
    [...webhookGroups].sort((a, b) => a[0].localeCompare(b[0]))
  );

  if (ungrouped.length > 0) {
    const uniqueGroupName = getUniqueGroupName("Webhooks", webhookGroups);
    for (const event of ungrouped) {
      addToWebhookGroup(webhookGroups, uniqueGroupName, event);
    }
  }

  return webhookGroups;
}

function addToWebhookGroup(
  webhookGroups: Map<string, TocWebhookPage[]>,
  groupName: string,
  event: TocWebhook
): void {
  const groupTitle = toTitleCase(groupName);
  if (!webhookGroups.has(groupTitle)) {
    webhookGroups.set(groupTitle, [
      {
        generate: null,
        from: "webhook-group-overview",
        webhookGroup: groupName
      }
    ]);
  }
  webhookGroups.get(groupTitle)!.push(event);
}

function createTocWebhook(webhook: SdlWebhook): TocWebhook {
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

  for (const callback of sdl.Endpoints.flatMap(e => e.Callbacks)) {
    const event = createTocCallback(callback);
    const groupKey = callback.CallbackGroupName ? toTitleCase(callback.CallbackGroupName) : null;

    if (groupKey) {
      addToCallbackGroup(callbackGroups, groupKey, callback.CallbackGroupName ?? null, event);
    } else {
      ungrouped.push(event);
    }
  }

  callbackGroups = new Map(
    [...callbackGroups].sort((a, b) => a[0].localeCompare(b[0]))
  );

  addUngroupedCallbacks(callbackGroups, ungrouped);
  return callbackGroups;
}

function addUngroupedCallbacks(
  callbackGroups: Map<string, TocCallbackPage[]>,
  ungrouped: TocCallbackPage[]
): void {
  if (ungrouped.length === 0) {
    return;
  }

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

function createTocCallback(callback: SdlCallback): TocCallback {
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

export function getSdlTocComponents(
  sdl: Sdl,
  expandEndpoints: boolean,
  expandModels: boolean,
  expandWebhooks: boolean,
  expandCallbacks: boolean
): SdlTocComponents {
  const endpointGroups = expandEndpoints ? extractEndpointGroupsForToc(sdl) : new Map();
  const models = expandModels ? extractModelsForToc(sdl) : [];
  const webhookGroups = expandWebhooks ? extractWebhooksForToc(sdl) : new Map();
  const callbackGroups = expandCallbacks ? extractCallbacksForToc(sdl) : new Map();
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
      Group: endpoint.Group,
      Callbacks: endpoint.Callbacks
    });
  }
  return endpointGroups;
}
