import { BlobServiceClient } from "@azure/storage-blob";

export const baseURL = "https://www.apimatic.io/api";
export const account = "apimaticio";
export const containerName = "cli";
export const blobName = "portal-scaffold.zip";

export const blobServiceClient = new BlobServiceClient(`https://${account}.blob.core.windows.net`);
