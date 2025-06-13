import { stringify } from "yaml";
import { Toc, TocGroup, TocEndpoint, TocModel, TocEndpointGroupOverview } from "../../../../types/toc/toc";

export class TocStructureGenerator {
  createTocStructure(
    endpointGroups: Map<string, TocEndpoint[]>,
    models: TocModel[],
    useIndividualEndpoints: boolean = false,
    useIndividualModels: boolean = false,
    contentGroups: TocGroup[] = []
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
    if (!useIndividualEndpoints || endpointGroups.size === 0) {
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

    // Add Models section
    if (!useIndividualModels || models.length === 0) {
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