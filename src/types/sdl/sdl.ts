import { TocEndpoint, TocModelPage, TocCallback, TocWebhook, TocWebhookPage, TocCallbackPage } from "../toc/toc.js";
import { toTitleCase } from "../../utils/utils.js";

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

function extractModelsForToc(sdl: Sdl): TocModelPage[] {
  return sdl.CustomTypes.map(
    (e: SdlModel): TocModelPage => ({
      generate: null,
      from: "model",
      modelName: e.Name
    })
  );
}

function extractWebhooksForToc(sdl: Sdl): Map<string, TocWebhookPage[]> {
  if (sdl.Webhooks.length === 0) {
    return new Map();
  }

  let webhookGroups = new Map<string, TocWebhookPage[]>();
  const ungrouped: TocWebhook[] = [];

  for (const webhook of sdl.Webhooks) {
    const event = createTocWebhook(webhook);

    // separate grouped and ungrouped webhooks
    if (webhook.WebhookGroupName) {
      addToWebhookGroup(webhookGroups, webhook.WebhookGroupName, event);
    } else {
      ungrouped.push(event);
    }
  }

  // sort groups before adding ungrouped webhooks
  webhookGroups = new Map(
    [...webhookGroups].sort((a, b) => a[0].localeCompare(b[0]))
  );

  // add ungrouped webhooks to a unique group
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
  const ungrouped: TocCallback[] = [];

  for (const callback of sdl.Endpoints.flatMap(e => e.Callbacks)) {
    const event = createTocCallback(callback);

    // separate grouped and ungrouped callbacks
    if (callback.CallbackGroupName) {
      addToCallbackGroup(callbackGroups, callback.CallbackGroupName, event);
    } else {
      ungrouped.push(event);
    }
  }

  // sort groups before adding ungrouped callbacks
  callbackGroups = new Map(
    [...callbackGroups].sort((a, b) => a[0].localeCompare(b[0]))
  );

  // add ungrouped callbacks to a unique group
  if (ungrouped.length > 0) {
    const uniqueGroupName = getUniqueGroupName("Callbacks", callbackGroups);
    for (const event of ungrouped) {
      addToCallbackGroup(callbackGroups, uniqueGroupName, event);
    }
  }

  return callbackGroups;
}

function addToCallbackGroup(
  callbackGroups: Map<string, TocCallbackPage[]>,
  groupName: string,
  event: TocCallback
): void {
  const groupTitle = toTitleCase(groupName);
  if (!callbackGroups.has(groupTitle)) {
    callbackGroups.set(groupTitle, [
      {
        generate: null,
        from: "callback-group-overview",
        callbackGroup: groupName
      }
    ]);
  }
  callbackGroups.get(groupTitle)!.push(event);
}

function createTocCallback(callback: SdlCallback): TocCallback {
  return {
    generate: null,
    from: "callback",
    callbackName: callback.Id,
    callbackGroup: callback.CallbackGroupName ?? null
  };
}

function getUniqueGroupName(baseName: string, existingGroups: Map<string, unknown>): string {
  let counter = 1;
  let name = baseName;

  while (existingGroups.has(toTitleCase(name))) {
    name = `${baseName}${counter}`;
    counter++;
  }

  return name;
}