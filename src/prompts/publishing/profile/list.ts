import pc from 'picocolors';
import { log } from '@clack/prompts';
import { Result } from 'neverthrow';
import { ServiceError } from '../../../infrastructure/service-error.js';
import { getLanguageConfigs, ProfileGroup, PublishingProfileItem } from '../../../types/publish-api/publishing-profile.js';
import { withSpinner } from '../../prompt.js';
import { stripAnsi } from '../../../utils/string-utils.js';

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

  public displayProfiles(groups: ProfileGroup[]) {
    const count = groups.reduce((sum, group) => sum + group.profiles.length, 0);
    const label = count === 1 ? '1 profile' : `${count} profiles`;
    const sections = groups
      .map((group) => `${pc.bold(pc.white(group.apiGroupName))}\n${buildTable(group.profiles)}`)
      .join('\n\n');
    log.info(`${pc.bold('Publishing Profiles')} ${pc.dim(`(${label})`)}\n\n${sections}`);
  }
}

/** Pad `text` to `width` visible characters (ANSI-safe). */
function pad(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - stripAnsi(text).length));
}

function buildTable(profiles: PublishingProfileItem[]): string {
  const COL_PAD = 2;
  const headers = ['Name', 'ID', 'Languages'];

  // Raw (no-color) cell values, used for column width calculation
  const rawRows = profiles.map((profile) => {
    const langs = getLanguageConfigs(profile)
      .filter(({ packageConfig, gitConfig }) => packageConfig?.isEnabled || gitConfig?.isEnabled)
      .map(({ language }) => language);
    return [profile.name, profile.id, langs.join(', ') || '—'];
  });

  // Width = max of header length and all raw cell lengths, plus padding
  const widths = headers.map((h, i) => Math.max(h.length, ...rawRows.map((r) => r[i].length)) + COL_PAD);

  // Color cells after widths are computed
  const coloredRows = rawRows.map((row) => [
    pc.magenta(row[0]),
    pc.dim(row[1]),
    row[2] === '—'
      ? pc.dim('—')
      : row[2]
          .split(', ')
          .map((l) => pc.cyan(l))
          .join(pc.dim(', '))
  ]);

  const divider = (l: string, m: string, r: string) => pc.gray(l + widths.map((w) => '─'.repeat(w + 2)).join(m) + r);

  const renderRow = (cells: string[]) =>
    pc.gray('│') + cells.map((cell, i) => ` ${pad(cell, widths[i])} ` + pc.gray('│')).join('');

  const coloredHeaders = headers.map((h) => pc.bold(pc.white(h)));

  const lines = [divider('┌', '┬', '┐'), renderRow(coloredHeaders), divider('├', '┼', '┤')];
  coloredRows.forEach((row, i) => {
    lines.push(renderRow(row));
    lines.push(i < coloredRows.length - 1 ? divider('├', '┼', '┤') : divider('└', '┴', '┘'));
  });
  return lines.join('\n');
}
