import { FileName } from '../file/fileName.js';

// One place for the names both the pages' links and the laid-out downloads use, so the two agree.
export const DOWNLOADS_ADDRESS = '__downloads';

export const SDK_DOWNLOADS_FOLDER = 'sdk';

export const PLUGIN_DOWNLOAD = new FileName('plugin.zip');

/** Keyed by the delivered name rather than `Language`, as the artifacts are. */
export function sdkDownload(language: string): FileName {
  return new FileName(`${language}.zip`);
}

export function sdkDownloadAddress(language: string): string {
  return `/${DOWNLOADS_ADDRESS}/${SDK_DOWNLOADS_FOLDER}/${sdkDownload(language)}`;
}

export const PLUGIN_DOWNLOAD_ADDRESS = `/${DOWNLOADS_ADDRESS}/${PLUGIN_DOWNLOAD}`;
