import * as fs from "fs-extra";
import { ApiResponse, FileWrapper } from "@apimatic/sdk";
import { GetValidationParams } from "../../types/api/validate";
import { APIValidationExternalApisController, ApiValidationSummary, ContentType } from "@apimatic/sdk";
import { createTempDirectory, deleteFile, zipDirectory } from "../../utils/utils";

export const getValidation = async (
  { file, url }: GetValidationParams,
  apiValidationController: APIValidationExternalApisController
): Promise<ApiValidationSummary> => {
  let validation: ApiResponse<ApiValidationSummary>;

  if (file) {
    const fileStatus = fs.statSync(file);
    if (fileStatus.isDirectory()){
      const tempDir = await createTempDirectory();

      try {
        const zipPath = await zipDirectory(file, tempDir);
        const zipFile = new FileWrapper(fs.createReadStream(zipPath));
        validation = await apiValidationController.validateAPIViaFile(ContentType.EnumMultipartformdata, zipFile);
        
        await deleteFile(zipPath);
      }
      catch (error) {
        throw new Error("There was an error validating your spec file.");
      }
      finally {
        await fs.remove(tempDir);
      }
    }
    else {
      const fileDescriptor = new FileWrapper(fs.createReadStream(file));
      validation = await apiValidationController.validateAPIViaFile(ContentType.EnumMultipartformdata, fileDescriptor);
    }
  } else if (url) {
    validation = await apiValidationController.validateAPIViaURL(url);
  } else {
    throw new Error("Please provide a specification file");
  }
  
  return validation.result;
};
