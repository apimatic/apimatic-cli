import pc from 'picocolors';
import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError } from '../../../infrastructure/service-error.js';
import { getLanguageConfigs, PublishingProfileItem } from '../../../types/publish-api/publishing-profile.js';
import { withSpinner } from '../../prompt.js';
import { stripAnsi } from '../../../utils/string-utils.js';

const COL_GAP = 2;

function pad(text: string, width: number): string {
  const visible = stripAnsi(text).length;
  return text + ' '.repeat(Math.max(0, width - visible));
}

function buildTable(profiles: PublishingProfileItem[]): string {
  const headers = ['Name', 'ID', 'Languages'];

  const rows = profiles.map((profile) => {
    const enabledLanguages = getLanguageConfigs(profile)
      .filter(({ config, gitConfig }) => config?.isEnabled || gitConfig?.isEnabled)
      .map(({ language }) => language);

    return [
      pc.magenta(profile.name),
      pc.dim(profile.id),
      enabledLanguages.length > 0 ? enabledLanguages.map((l) => pc.cyan(l)).join(pc.dim(',')) : pc.dim('—')
    ];
  });

  const colCount = headers.length;
  const colWidths = Array.from({ length: colCount }, (_, i) =>
    Math.max(headers[i].length, ...rows.map((r) => stripAnsi(r[i]).length)) + COL_GAP
  );

  const hr = (left: string, mid: string, right: string, fill: string) =>
    pc.gray(left + colWidths.map((w) => fill.repeat(w + 2)).join(mid) + right);

  const row = (cells: string[], color: (s: string) => string = (s) => s) =>
    pc.gray('│') +
    cells.map((cell, i) => ` ${color(pad(cell, colWidths[i]))} ` + pc.gray('│')).join('');

  const lines: string[] = [
    '',
    hr('┌', '┬', '┐', '─'),
    row(headers, (s) => pc.bold(pc.white(s))),
    hr('├', '┼', '┤', '─'),
    ...rows.map((r) => row(r)),
    hr('└', '┴', '┘', '─'),
    ''
  ];

  return lines.join('\n');
}

export class PublishingProfileListPrompts {
  public fetchProfiles(fn: Promise<Result<PublishingProfileItem[], ServiceError>>) {
    return withSpinner(
      'Fetching publishing profiles',
      'Fetched publishing profiles',
      'Error fetching publishing profiles',
      fn
    );
  }

  public fetchError(error: ServiceError) {
    log.error(error.errorMessage);
  }

  public noProfilesFound() {
    log.info('No publishing profiles found.');
  }

  public displayProfiles(profiles: PublishingProfileItem[]) {
    const count = profiles.length;
    const label = count === 1 ? '1 profile' : `${count} profiles`;
    log.info(`${pc.bold('Publishing Profiles')} ${pc.dim(`(${label})`)}\n${buildTable(profiles)}`);
  }
}
