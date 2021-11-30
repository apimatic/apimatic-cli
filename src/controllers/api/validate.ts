import cli from "cli-ux";
import * as fs from "fs-extra";
import Command from "@oclif/command";

import { APIValidationExternalApisController, ApiValidationSummary } from "@apimatic/apimatic-sdk-for-js";
import { ApiResponse, FileWrapper } from "@apimatic/core";
import { GetValidationParams } from "../../types/api/validate";
import { replaceHTML } from "../../utils/utils";

export const getValidation = async (
  { file, url }: GetValidationParams,
  apiValidationController: APIValidationExternalApisController
): Promise<ApiValidationSummary> => {
  let validation: ApiResponse<ApiValidationSummary>;

  cli.action.start("Validating specification file");
  if (file) {
    const fileDescriptor = new FileWrapper(fs.createReadStream(file));
    validation = await apiValidationController.validateAPIViaFile(fileDescriptor);
  } else if (url) {
    validation = await apiValidationController.validateAPIViaURL(url);
  } else {
    throw new Error("Please provide a specification file");
  }
  cli.action.stop();
  return validation.result;
};

export const printValidationMessages = (
  { warnings, errors }: ApiValidationSummary,
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
