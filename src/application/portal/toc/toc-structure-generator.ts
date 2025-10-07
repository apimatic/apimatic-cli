import { stringify } from "yaml";
import { Toc, TocGroup, TocEndpoint, TocModel, TocCallbackPage, TocWebhookPage, TocEndpointGroupOverview } from "../../../types/toc/toc.js";

export class TocStructureGenerator {
  createTocStructure(
    endpointGroups: Map<string, TocEndpoint[]>,
    models: TocModel[],
    expandEndpoints: boolean = false,
    expandModels: boolean = false,
    contentGroups: TocGroup[] = [],
    webhooks: Map<string, TocWebhookPage[]>,
    callbacks: Map<string, TocCallbackPage[]>,
    expandWebhooks: boolean = false,
    expandCallbacks: boolean = false
  ): Toc {
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
    if (!expandEndpoints || endpointGroups.size === 0) {
      tocStructure.toc.push({
        generate: "API Endpoints",
        from: "endpoints"
      });
    } else {
      tocStructure.toc.push({
        group: "API Endpoints",
        items: Array.from(endpointGroups).map(([groupName, endpoints]) => ({
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

    if (!expandCallbacks || callbacks.size === 0) {
      eventsItems.push({
        generate: null,
        from: "callbacks"
      });
    } else if (callbacks.size === 1) {
      eventsItems.push({
        group: Array.from(callbacks.keys())[0],
        items: Array.from(callbacks.values())[0]
      });
    } else {
      eventsItems.push({
        group: "Callbacks",
        items: Array.from(callbacks).map(([groupName, eventList]) => ({
          group: groupName,
          items: eventList
        }))
      });
    }

    if (!expandWebhooks || webhooks.size === 0) {
      eventsItems.push({
        generate: null,
        from: "webhooks"
      });
    } else if (webhooks.size === 1) {
      eventsItems.push({
        group: Array.from(webhooks.keys())[0],
        items: Array.from(webhooks.values())[0]
      });
    } else {
      eventsItems.push({
        group: "Webhooks",
        items: Array.from(webhooks).map(([groupName, eventList]) => ({
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
    if (!expandModels || models.length === 0) {
      tocStructure.toc.push({
        generate: "Models",
        from: "models"
      });
    } else {
      tocStructure.toc.push({
        group: "Models",
        items: models
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
