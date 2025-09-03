import { SdlTocComponents } from "../spec-context.js";
import { TocEndpoint, TocModel } from "../toc/toc.js";

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
