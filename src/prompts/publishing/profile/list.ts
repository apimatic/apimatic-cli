import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError } from '../../../infrastructure/service-error.js';
import { PublishingProfileSummaryGroup, PublishingProfileItem } from '../../../types/publish-api/publishing-profile-item.js';
import { buildTableWithHeading, withSpinner } from '../../prompt.js';

export class PublishingProfileListPrompts {
  public fetchProfiles(fn: Promise<Result<PublishingProfileItem[], ServiceError>>) {
    return withSpinner(
      'Fetching publishing profiles',
      'Publishing profiles fetched successfully.',
      'Failed to fetch publishing profiles.',
      fn
    );
  }

  public fetchError(error: ServiceError) {
    log.error(error.errorMessage);
  }

  public noProfilesFound() {
    log.info('No publishing profiles found. Please create a publishing profile on the APIMatic App to view it here.');
  }

  public displayProfiles(groups: PublishingProfileSummaryGroup[]) {
    const count = groups.reduce((sum, g) => sum + g.profiles.length, 0);
    const label = count === 1 ? '1 profile' : `${count} profiles`;
    const tableGroups = groups.map((group) => ({
      heading: group.apiGroupName,
      rows: group.profiles.map((profile) => [
        profile.name,
        profile.id,
        profile.enabledLanguages.length === 0 ? '—' : profile.enabledLanguages.join(', '),
      ]),
    }));
    log.info(`Publishing Profiles (${label})\n\n${buildTableWithHeading(tableGroups, ['Name', 'ID', 'Languages'], ['primary', 'secondary', 'item'])}`);
  }
}
