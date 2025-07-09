import fsExtra from "fs-extra";
import { ApiResponse, ApiValidationExternalApisController, ApiValidationSummary, ContentType, FileWrapper } from "@apimatic/sdk";
import { GetValidationParams } from "../../types/api/validate.js";
import { createTempDirectory, deleteFile, zipDirectory } from "../../utils/utils.js";

export const getValidationSummary = async (
  { file, url }: GetValidationParams,
  apiValidationController: ApiValidationExternalApisController
): Promise<ApiValidationSummary> => {
  let validation: ApiResponse<ApiValidationSummary>;

  if (file) {
    const fileStatus = fsExtra.statSync(file);
    if (fileStatus.isDirectory()) {
      const tempDir = await createTempDirectory();
      const zipPath = await zipDirectory(file, tempDir);
      const zipFile = new FileWrapper(fsExtra.createReadStream(zipPath));
      validation = await apiValidationController.validateApiViaFile(ContentType.EnumMultipartformdata, zipFile);

      await deleteFile(zipPath);

      await fsExtra.remove(tempDir);
    } else {
      const fileDescriptor = new FileWrapper(fsExtra.createReadStream(file));
      validation = await apiValidationController.validateApiViaFile(ContentType.EnumMultipartformdata, fileDescriptor);
    }
  } else if (url) {
    validation = await apiValidationController.validateApiViaUrl(url);
  } else {
    throw new Error("Please provide a specification file");
  }

  return validation.result;
};
