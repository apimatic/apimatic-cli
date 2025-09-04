import { TocEndpoint, TocModel } from "../toc/toc.js";
export type EndpointGroup = Map<string, TocEndpoint[]>;
export type SdlTocComponents = { endpointGroups: EndpointGroup; models: TocModel[] };


export interface Sdl {
  readonly Endpoints: SdlEndpoint[];
  readonly CustomTypes: SdlModel[];
}

export interface SdlEndpoint {
  readonly Name: string;
  readonly Description: string;
  readonly Group: string;
}

export interface SdlModel {
  readonly Name: string;
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

function extractModelsForToc(sdl: Sdl): TocModel[] {
  return sdl.CustomTypes.map(
    (e: SdlModel): TocModel => ({
      generate: null,
      from: "model",
      modelName: e.Name
    })
  );
}

export function getEndpointGroupsAndModels(sdl: Sdl): SdlTocComponents {
  const endpointGroups = extractEndpointGroupsForToc(sdl);
  const models = extractModelsForToc(sdl);
  return { endpointGroups, models };
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
