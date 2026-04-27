import { Result, ok, err } from 'neverthrow';
import { PublishingProfileItem } from '../publish-api/publishing-profile-item.js';

export class ProfileId {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  public static createFromPublishingProfileItem(profile: PublishingProfileItem): ProfileId {
    return new ProfileId(profile.id);
  }

  public static tryCreate(value: string): Result<ProfileId, string> {
    if (!value || value.trim() === '') {
      return err('Profile ID cannot be empty.');
    }
    return ok(new ProfileId(value));
  }

  public isEqual(other: ProfileId): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
