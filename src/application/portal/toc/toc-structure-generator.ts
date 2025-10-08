import { stringify } from "yaml";
import { Toc, TocGroup, TocEndpointGroupOverview } from "../../../types/toc/toc.js";
import { SdlTocComponents } from "../../../types/sdl/sdl.js";

export class TocStructureGenerator {
  createTocStructure(sdlComponents: SdlTocComponents, contentGroups: TocGroup[] = []): Toc {
    const tocStructure: Toc = {
      toc: []
    };

    // Add Getting Started section
    tocStructure.toc.push({
      group: "Getting Started",
      items: [
        {
          generate: "How to Get Started",
          from: "getting-started"
        }
      ]
    });

    // Add content groups
    if (contentGroups.length > 0) {
      tocStructure.toc.push(...contentGroups);
    }

    // Add API Endpoints section
    if (sdlComponents.endpointGroups.size === 0) {
      tocStructure.toc.push({
        generate: "API Endpoints",
        from: "endpoints"
      });
    } else {
      tocStructure.toc.push({
        group: "API Endpoints",
        items: Array.from(sdlComponents.endpointGroups).map(([groupName, endpoints]) => ({
          group: groupName,
          items: [
            {
              generate: null,
              from: "endpoint-group-overview",
              endpointGroup: groupName
            } as TocEndpointGroupOverview,
            ...endpoints
          ]
        }))
      });
    }

    // Add Events section
    const eventsItems: any[] = [];

    if (sdlComponents.callbackGroups.size === 0) {
      eventsItems.push({
        generate: null,
        from: "callbacks"
      });
    } else if (sdlComponents.callbackGroups.size === 1) {
      eventsItems.push({
        group: Array.from(sdlComponents.callbackGroups.keys())[0],
        items: Array.from(sdlComponents.callbackGroups.values())[0]
      });
    } else {
      eventsItems.push({
        group: "Callbacks",
        items: Array.from(sdlComponents.callbackGroups).map(([groupName, eventList]) => ({
          group: groupName,
          items: eventList
        }))
      });
    }

    if (sdlComponents.webhookGroups.size === 0) {
      eventsItems.push({
        generate: null,
        from: "webhooks"
      });
    } else if (sdlComponents.webhookGroups.size === 1) {
      eventsItems.push({
        group: Array.from(sdlComponents.webhookGroups.keys())[0],
        items: Array.from(sdlComponents.webhookGroups.values())[0]
      });
    } else {
      eventsItems.push({
        group: "Webhooks",
        items: Array.from(sdlComponents.webhookGroups).map(([groupName, eventList]) => ({
          group: groupName,
          items: eventList
        }))
      });
    }

    tocStructure.toc.push({
      group: "Events",
      items: eventsItems
    });


    // Add Models section
    if (sdlComponents.models.length === 0) {
      tocStructure.toc.push({
        generate: "Models",
        from: "models"
      });
    } else {
      tocStructure.toc.push({
        group: "Models",
        items: sdlComponents.models
      });
    }

    //Add Sdk Infra section
    tocStructure.toc.push({
      generate: "SDK Infrastructure",
      from: "sdk-infra"
    });

    return tocStructure;
  }

  transformToYaml(toc: Toc): string {
    const transformedToc = this.transformKeys(toc);
    return stringify(transformedToc, {
      indent: 2,
      nullStr: ""
    });
  }

  private transformKeys(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.transformKeys(item));
    }
    if (obj !== null && typeof obj === "object") {
      return Object.fromEntries(
        Object.entries(obj).map(([key, value]) => [
          key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(),
          this.transformKeys(value)
        ])
      );
    }
    return obj;
  }
}
