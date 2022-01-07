import cli from "cli-ux";

import { unzipFile } from "../../utils/utils";
import { BlobDownloadResponseParsed } from "@azure/storage-blob";
import { blobName, blobServiceClient, containerName } from "../../config/env";

export const portalScaffold = async (folder: string) => {
  cli.action.start("Scaffolding source files for static portal");
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blobClient = containerClient.getBlobClient(blobName);

  const downloadBlockBlobResponse: BlobDownloadResponseParsed = await blobClient.download();

  if (downloadBlockBlobResponse.readableStreamBody) {
    await unzipFile(downloadBlockBlobResponse.readableStreamBody, folder);
  }
  cli.action.stop();
  return `Portal scaffold completed at ${folder}`;
};
