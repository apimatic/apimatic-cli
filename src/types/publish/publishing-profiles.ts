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
      return err('No publishing profiles found. Please create a publishing profile on the APIMatic app before publishing an SDK.');
    }

    return ok(new PublishingProfiles(items.map((item) => PublishingProfile.create(item))));
  }

  public getActiveProfiles(): PublishingProfile[] {
    return this.items.filter((p) => p.hasEnabledLanguages());
  }

  public toActiveProfilesGroups(): PublishingProfileWithLanguagesGroup[] {
    return this.groupByApiGroup(this.getActiveProfiles().map((p) => p.toPublishingProfileWithLanguagesGroup()));
  }

  public toPublishingProfileSummariesByApiGroups(): PublishingProfileSummaryGroup[] {
    return this.groupByApiGroup(this.items.map((p) => p.toPublishingProfileSummaryGroup()));
  }

  private groupByApiGroup<T extends { apiGroupName: string; profiles: unknown[] }>(entries: T[]): T[] {
    const map = new Map<string, T>();
    for (const entry of entries) {
      const existing = map.get(entry.apiGroupName);
      if (existing) {
        (existing.profiles as unknown[]).push(...entry.profiles);
      } else {
        map.set(entry.apiGroupName, { ...entry, profiles: [...entry.profiles] });
      }
    }
    return [...map.values()];
  }
}
