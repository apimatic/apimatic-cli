import { err, ok, Result } from 'neverthrow';
import { PublishingProfileItem } from '../publish-api/publishing-profile-item.js';
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
}
