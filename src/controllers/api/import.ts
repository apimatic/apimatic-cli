import cli from "cli-ux";
import * as fs from "fs-extra";
import Command from "@oclif/command";

import { ApiEntity, ApiResponse, ApisManagementController, FileWrapper, ImportValidationSummary } from "@apimatic/sdk";
import { GetImportParams } from "../../types/api/import";
import { replaceHTML } from "../../utils/utils";

export const importAPISpec = async (
  { file, url }: GetImportParams,
  apisManagementController: ApisManagementController
): Promise<ApiEntity> => {
  cli.action.start("Importing specification file");
  let response: ApiResponse<ApiEntity>;
  if (file) {
    const fileDescriptor = new FileWrapper(fs.createReadStream(file));
    response = await apisManagementController.importAPIViaFile(fileDescriptor);
  } else if (url) {
    response = await apisManagementController.importAPIViaURL({ url });
  } else {
    throw new Error("Please provide a specification file");
  }
  cli.action.stop();
  return response.result;
};

export const printValidationMessages = (
  { warnings, errors }: ImportValidationSummary,
  warn: Command["warn"],
  error: Command["error"]
) => {
  warnings.forEach((warning) => {
    warn(`${replaceHTML(warning)}`);
  });
  if (errors.length > 0) {
    const singleLineError: string = errors.join("\n");
    error(replaceHTML(singleLineError));
  }
};
