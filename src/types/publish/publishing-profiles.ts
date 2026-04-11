import {
  PublishingProfileItem,
  PublishingProfileSummaryGroup,
  PublishingProfileWithLanguagesGroup
} from '../publish-api/publishing-profile-item.js';
import { PublishingProfile } from './publishing-profile.js';

interface ProfileGroup {
  apiGroupId: string;
  apiGroupName: string;
  profiles: PublishingProfileItem[];
}

export class PublishingProfiles {
  private constructor(private readonly items: PublishingProfileItem[]) {}

  public static create(items: PublishingProfileItem[]): PublishingProfiles {
    return new PublishingProfiles(items);
  }

  public isEmpty(): boolean {
    return this.items.length === 0;
  }

  public getProfilesWithEnabledLanguages(): PublishingProfiles {
    return new PublishingProfiles(this.items.filter((item) => PublishingProfile.create(item).hasEnabledLanguages()));
  }

  public toProfilesWithEnabledLanguagesByApiGroup(): PublishingProfileWithLanguagesGroup[] {
    const profileGroups = this.getProfileGroups();
    return profileGroups.map((group) => ({
      apiGroupName: group.apiGroupName,
      profiles: group.profiles.map((item) => ({
        profile: item,
        enabledLanguages: PublishingProfile.create(item).getEnabledLanguages()
      }))
    }));
  }

  public toSummaryGroups(): PublishingProfileSummaryGroup[] {
    const profileGroups = this.getProfileGroups();
    return profileGroups.map((group) => ({
      apiGroupName: group.apiGroupName,
      profiles: group.profiles.map((item) => ({
        name: item.name,
        id: item.id,
        enabledLanguages: PublishingProfile.create(item).getEnabledLanguages()
      }))
    }));
  }

  private getProfileGroups(): ProfileGroup[] {
    return this.items.reduce<ProfileGroup[]>((groups, profile) => {
      const group = groups.find((g) => g.apiGroupId === profile.apiGroupId);
      if (group) {
        group.profiles.push(profile);
      } else {
        groups.push({ apiGroupId: profile.apiGroupId, apiGroupName: profile.apiGroupName, profiles: [profile] });
      }
      return groups;
    }, []);
  }
}
