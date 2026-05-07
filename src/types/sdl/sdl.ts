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
