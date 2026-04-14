import { err, ok, Result } from 'neverthrow';
import {
  PublishingProfileItem,
  PublishingProfileSummaryGroup,
  PublishingProfileWithLanguagesGroup
} from '../publish-api/publishing-profile-item.js';
import { PublishingProfile } from './publishing-profile.js';

export class PublishingProfiles {
  private constructor(private readonly items: PublishingProfile[]) {}

  public static create(items: PublishingProfileItem[]): Result<PublishingProfiles, string> {
    if (items.length === 0) {
      return err('No publishing profiles found. Please create a publishing profile before publishing an SDK.');
    }

    return ok(new PublishingProfiles(items.map((item) => PublishingProfile.create(item))));
  }

  public getActiveProfiles(): PublishingProfile[] {
    return this.items.filter((p) => p.hasEnabledLanguages());
  }

  public toActiveProfilesGroups(): PublishingProfileWithLanguagesGroup[] {
    return this.items
      .filter((p) => p.hasEnabledLanguages())
      .map((p) => p.toPublishingProfileWithLanguagesGroup())
      .reduce<PublishingProfileWithLanguagesGroup[]>((acc, entry) => {
        const existing = acc.find((g) => g.apiGroupName === entry.apiGroupName);
        if (existing) {
          existing.profiles.push(...entry.profiles);
        } else {
          acc.push({ ...entry, profiles: [...entry.profiles] });
        }
        return acc;
      }, []);
  }

  public toPublishingProfileSummariesByApiGroups(): PublishingProfileSummaryGroup[] {
    return this.items
      .map((p) => p.toPublishingProfileSummaryGroup())
      .reduce<PublishingProfileSummaryGroup[]>((acc, entry) => {
        const existing = acc.find((g) => g.apiGroupName === entry.apiGroupName);
        if (existing) {
          existing.profiles.push(...entry.profiles);
        } else {
          acc.push({ ...entry, profiles: [...entry.profiles] });
        }
        return acc;
      }, []);
  }
}
