import { PublishingProfileItem, PublishingProfileSummaryGroup } from '../publish-api/publishing-profile-item.js';
import { PublishingProfile } from './publishing-profile.js';

interface ApiGroup {
  apiGroupId: string;
  apiGroupName: string;
  items: PublishingProfileItem[];
}

export class PublishingProfileSummaries {
  private constructor(private readonly items: PublishingProfileItem[]) {}

  public static create(items: PublishingProfileItem[]): PublishingProfileSummaries {
    return new PublishingProfileSummaries(items);
  }

  public toPublishingProfileSummariesByApiGroups(): PublishingProfileSummaryGroup[] {
    return this.groupByApiGroup().map((group) => ({
      apiGroupName: group.apiGroupName,
      profiles: group.items.map((item) => ({
        name: item.name,
        id: item.id,
        enabledLanguages: PublishingProfile.create(item).getEnabledLanguages()
      }))
    }));
  }

  private groupByApiGroup(): ApiGroup[] {
    return this.items.reduce<ApiGroup[]>((groups, item) => {
      const group = groups.find((g) => g.apiGroupId === item.apiGroupId);
      if (group) {
        group.items.push(item);
      } else {
        groups.push({ apiGroupId: item.apiGroupId, apiGroupName: item.apiGroupName, items: [item] });
      }
      return groups;
    }, []);
  }
}
