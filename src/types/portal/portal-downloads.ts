import { FileName } from '../file/fileName.js';

/**
 * Where the portal offers what the portal artifacts delivered. The portal project lays the files
 * out under these names, and `portal-template/downloads.ts` serves that directory at this address,
 * so the pages that link to a download and the directory that holds it agree by construction.
 */
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
