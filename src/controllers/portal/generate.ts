import cli from "cli-ux";
import * as fs from "fs-extra";
import { deleteFile, extractZipFile, writeFileUsingReadableStream } from "../../utils/utils";
import { GeneratePortalParams } from "../../types/portal/generate";
import { ApiResponse, ContentType, FileWrapper } from "@apimatic/sdk";

// Download Docs Portal
export const downloadDocsPortal = async (
  { zippedBuildFilePath, portalFolderPath, zippedPortalPath, docsPortalController, zip }: GeneratePortalParams) => {
  cli.action.start("Downloading portal");

  // Check if the build file exists for the user or not
  if (!(await fs.pathExists(zippedBuildFilePath))) {
    throw new Error("Build file doesn't exist");
  }

  const file: FileWrapper = new FileWrapper(fs.createReadStream(zippedBuildFilePath));

  try {
    const { result }: ApiResponse<NodeJS.ReadableStream | Blob> =
    await docsPortalController.generateOnPremPortalViaBuildInput(ContentType.EnumMultipartformdata, file);

    if ((result as NodeJS.ReadableStream).readable) {
      await writeFileUsingReadableStream(result as NodeJS.ReadableStream, zippedPortalPath);
      
      if (!zip) {
        await extractZipFile(zippedPortalPath, portalFolderPath);
        await deleteFile(zippedPortalPath);
      }
      
      cli.action.stop();
      return zip ? zippedPortalPath : portalFolderPath;
    } else {
      throw new Error("Couldn't download the portal");
    }
  }
  catch (err) {
    throw new Error("Couldn't download the portal because: " + err);  
  }
};