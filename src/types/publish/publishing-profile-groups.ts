import { PublishingProfileItem, PublishingProfileWithLanguagesGroup } from '../publish-api/publishing-profile-item.js';
import { PublishingProfile } from './publishing-profile.js';

interface ProfilesGroup {
  apiGroupId: string;
  apiGroupName: string;
  profiles: PublishingProfileItem[];
}

export class PublishingProfileGroups {
  private constructor(private readonly items: PublishingProfileItem[]) {}

  public static create(items: PublishingProfileItem[]): PublishingProfileGroups {
    return new PublishingProfileGroups(items.filter((item) => PublishingProfile.create(item).hasEnabledLanguages()));
  }

  public toActiveProfilesGroups(): PublishingProfileWithLanguagesGroup[] {
    const profilesGroups = this.groupProfilesByApiGroup();
    return profilesGroups.map((group) => ({
      apiGroupName: group.apiGroupName,
      profiles: group.profiles.map((item) => ({
        profile: item,
        enabledLanguages: PublishingProfile.create(item).getEnabledLanguages()
      }))
    }));
  }

  private groupProfilesByApiGroup(): ProfilesGroup[] {
    return this.items.reduce<ProfilesGroup[]>((groups, item) => {
      const group = groups.find((g) => g.apiGroupId === item.apiGroupId);
      if (group) {
        group.profiles.push(item);
      } else {
        groups.push({ apiGroupId: item.apiGroupId, apiGroupName: item.apiGroupName, profiles: [item] });
      }
      return groups;
    }, []);
  }
}
