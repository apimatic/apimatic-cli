import * as fs from 'fs-extra';
import * as path from 'path';
import * as archiver from 'archiver';

export async function validateAndZipPortalSource(sourceDir: string, outputPath: string, ignoredPaths: string[]): Promise<string> {

  const output = fs.createWriteStream(outputPath);
  const archive = archiver('zip', {
    zlib: { level: 9 }
  });

  return new Promise((resolve, reject) => {
    output.on('close', () => resolve(outputPath));
    archive.on('error', err => reject(err));

    archive.pipe(output);

    // Function to recursively add files and directories to the archive, excluding ignored paths
    const addItemsToArchive = async (currentPath: string, archivePath: string | false) => {
      const items = await fs.readdir(currentPath);
      for (const item of items) {
        const fullPath = path.join(currentPath, item);
        const relativePath = path.relative(sourceDir, fullPath);

        // Check if the path is ignored
        const isIgnored = ignoredPaths.some(ignoredPath =>
          relativePath === ignoredPath || relativePath.startsWith(ignoredPath + '/') || relativePath.startsWith(ignoredPath + '\\'));
        if (!isIgnored) {
          const stats = await fs.stat(fullPath);
          if (stats.isDirectory()) {
            await addItemsToArchive(fullPath, archivePath ? path.join(archivePath, item) : item);
          } else {
            archive.file(fullPath, { name: archivePath ? path.join(archivePath, item) : item });
          }
        }
      }
    };

    // Start adding items from the source directory
    addItemsToArchive(sourceDir, false).then(() => {
      archive.finalize();
    }).catch(reject);
  });
}
