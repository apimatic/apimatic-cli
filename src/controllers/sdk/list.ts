import {
  APIEntityCodeGeneration,
  Client,
  CodeGenerationExternalApisController,
  CodeGenerationImportedApisController,
  UserCodeGeneration
} from "@apimatic/sdk";
import { SDKClient } from "../../client-utils/sdk-client";
import { CodeGeneration, SDKListParams } from "../../types/sdk/list";

export const getSdkList = async (
  { "auth-key": authKey, "api-entity": apiEntityId, external }: SDKListParams,
  configDir: string
) => {
  const overrideAuthKey = authKey ? authKey : null;
  const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, configDir);
  const sdkExternalController = new CodeGenerationExternalApisController(client);
  const sdkImportedController = new CodeGenerationImportedApisController(client);

  let generations: CodeGeneration[] = [];

  if (external) {
    const externalGenerations: UserCodeGeneration[] = (await sdkExternalController.listAllCodeGenerations()).result;
    generations = [
      ...externalGenerations.map(({ id, template, inputFile }) => ({ id, template, inputFile }), ...generations)
    ];
  }
  if (apiEntityId) {
    const importedGenerations: APIEntityCodeGeneration[] = (
      await sdkImportedController.listAllCodeGenerations(apiEntityId)
    ).result;

    generations = [
      ...importedGenerations.map(
        ({ id, template, apiEntityId }) => ({ id, template, "api-entity": apiEntityId }),
        ...generations
      )
    ];
  }

  return generations;
};
