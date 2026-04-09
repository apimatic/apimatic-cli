import pc from 'picocolors';
import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError } from '../../../infrastructure/service-error.js';
import { PublishingProfileSummaryGroup, PublishingProfileItem } from '../../../types/publish-api/publishing-profile.js';
import { buildTable, withSpinner } from '../../prompt.js';

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
    log.info('No publishing profiles found. Please create a publishing profile to view it here.');
  }

  // TODO: Move table creation to format.ts and make it reusable for other tables in the CLI
  public displayProfiles(groups: PublishingProfileSummaryGroup[]) {
    const count = groups.reduce((sum, group) => sum + group.profiles.length, 0);
    const label = count === 1 ? '1 profile' : `${count} profiles`;
    const sections = groups
      .map((group) => {
        const rows = group.profiles.map((profile) => {
          const langsCell = profile.enabledLanguages.length === 0
            ? pc.dim('—')
            : profile.enabledLanguages.map((l) => pc.cyan(l)).join(pc.dim(', '));
          return [pc.magenta(profile.name), pc.dim(profile.id), langsCell];
        });
        return `${pc.bold(pc.white(group.apiGroupName))}\n${buildTable(['Name', 'ID', 'Languages'], rows, true)}`;
      })
      .join('\n\n');
    log.info(`${pc.bold('Publishing Profiles')} ${pc.dim(`(${label})`)}\n\n${sections}`);
  }
}
