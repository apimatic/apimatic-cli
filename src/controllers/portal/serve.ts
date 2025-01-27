import * as path from 'path';
import * as chokidar from 'chokidar';
import { Client, DocsPortalManagementController } from '@apimatic/sdk';
import { SDKClient } from '../../client-utils/sdk-client';
import { validateAndZipPortalSource } from '../../utils/utils';
import { GeneratePortalParams } from '../../types/portal/generate';
import { downloadDocsPortal } from './generate';

export const watchAndRegeneratePortal = async (sourceDir: string, portalDir: string, configDir: string, overrideAuthKey: string | null, ignoredPaths: string[] = []) => {
    // Convert ignoredPaths to absolute paths for consistent comparison
    const generatedZipPath = path.join(sourceDir, 'portal_source.zip')
    const generatedPortalPath = path.join(path.dirname(portalDir), "api-portal");
    const absoluteIgnoredPaths = [
      ...ignoredPaths.filter(ignoredPath => ignoredPath.trim() !== ''),
      generatedZipPath,
      generatedPortalPath
    ].map(ignoredPath => path.resolve(sourceDir, ignoredPath));

    const watcher = chokidar.watch(sourceDir, { 
      ignored: absoluteIgnoredPaths, 
      ignoreInitial: true,
      persistent: true 
    });

    watcher.on('change', async () => {
    //   console.log(`Change detected in build input file ${filePath}. Regenerating portal...`);
      try {
        await generatePortal(sourceDir, portalDir, configDir, overrideAuthKey, absoluteIgnoredPaths);
        process.stdout.write('\u001b[2K'); // Clear the entire line
        process.stdout.write('\u001b[G'); // Move the cursor to the beginning of the line
        process.stdout.write('✅  Portal regenerated successfully.');
        // console.log('Portal regenerated successfully.');
      } catch (error) {
        console.error('Error during portal regeneration:', error);
      }
    })
    .on('error', (error: any) => {
      console.error('Watcher error:', error);
    });

    return watcher;
};

export const generatePortal = async (sourceDir: string, portalDir: string, configDir: string, overrideAuthKey: string | null , ignoredPaths: string[] = []) => {
    const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, configDir);
    const docsPortalController: DocsPortalManagementController = new DocsPortalManagementController(client);

    const zippedBuildFilePath = await validateAndZipPortalSource(sourceDir, path.join(path.dirname(portalDir), "portal_source.zip") , ignoredPaths);

    const generatePortalParams: GeneratePortalParams = {
        zippedBuildFilePath,
        portalFolderPath: portalDir,
        zippedPortalPath: path.join(path.dirname(portalDir), "generated_portal.zip"),
        docsPortalController,
        overrideAuthKey,
        zip: false
    };

    await downloadDocsPortal(generatePortalParams, configDir);
};