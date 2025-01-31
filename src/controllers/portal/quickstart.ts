import simpleGit from 'simple-git';
import axios from 'axios';
import * as path from 'path';
import * as filetype from 'file-type';
import * as fs from 'fs';
import * as fsextra from 'fs-extra';
import { getAuthInfo } from "../../client-utils/auth-manager";
import { APIValidationExternalApisController, ApiValidationSummary } from "@apimatic/sdk";
import { LoginCredentials } from "../../types/portal/quickstart";
import { SDKClient } from "../../client-utils/sdk-client";
import { SpecFile } from '../../types/portal/quickstart';
import { createTempDirectory, isValidUrl, unzipFile, getMessageInRedColor, clearDirectory, deleteFile } from '../../utils/utils';
import { getValidation } from '../api/validate';
import { GetValidationParams } from '../../types/api/validate';
import { generatePortal } from './serve';
import { staticPortalRepoUrl } from '../../config/env';
import { PortalServerService } from '../../services/portal/server';


export class PortalQuickstartController {
    private specUrl = "https://github.com/apimatic/static-portal-workflow/blob/master/spec/Apimatic-Calculator.json";

    async isUserAuthenticated(authKey: string | null, configDir: string) : Promise<boolean> {
        if (!authKey)
        {
            const storedAuth = await getAuthInfo(configDir);
            if (!storedAuth || !storedAuth.authKey) 
            {
                return false;
            }
            
            return true;
        }
        return false;
    }

    async userLogin(credentials: LoginCredentials, client: SDKClient, configDir: string) : Promise<void> {
        await client.login(credentials.email, credentials.password, configDir);
    }

    async getSpecFile(spec: string) : Promise<SpecFile> {
        let filePath = "";
        const tempSpecDir = await createTempDirectory();
    
        if (spec) {
          const specPath = String(spec);
      
          if (isValidUrl(specPath)) {
            try {
              const specFile = await axios.get(specPath, { responseType: 'arraybuffer' });
              const fileName = path.basename(specPath);
              filePath = path.join(tempSpecDir, fileName);
              await fsextra.writeFile(filePath, specFile.data);
            } catch (error) {
              throw new Error(getMessageInRedColor(`There was an error fetching your spec: ${error}`));
            }
          } else {
            if (fs.statSync(specPath).isDirectory()) {
              throw new Error(getMessageInRedColor('Directory paths are not supported, please enter a path to a valid file or zip file instead.'));
            }
            
            const fileType = await filetype.fromFile(specPath);
            
            if (fileType?.ext === 'zip') {
              filePath = tempSpecDir;
              await unzipFile(fs.createReadStream(specPath), tempSpecDir);
            } else {
              const destinationPath = path.join(tempSpecDir, path.basename(specPath));
              filePath = destinationPath;
              await fsextra.copy(specPath, destinationPath);
            }
          }
        }
    
        return { filePath, url: this.specUrl };
      }

    async getSpecValidationSummary(specFile: SpecFile, apiValidationController: APIValidationExternalApisController) : Promise<ApiValidationSummary> {
        const validationFlags: GetValidationParams = {
              file: specFile.filePath,
              url: specFile.url
            };
            
        return await getValidation(validationFlags, apiValidationController);
    }

    async setupBuildDirectory(targetFolder: string, specFile: SpecFile, validationSummary: ApiValidationSummary, languages: string[]) : Promise<void> {
        const git = simpleGit();
        
        await git.clone(staticPortalRepoUrl, targetFolder);
        await clearDirectory(path.join(targetFolder, '.github'));
    
        if (specFile.filePath && validationSummary.success)
        {
            await deleteFile(path.join(targetFolder, 'spec', 'Apimatic-Calculator.json'));
            fsextra.copy(specFile.filePath, path.join(targetFolder, 'spec', path.basename(specFile.filePath)));
        }
        
        const buildFilePath = path.join(targetFolder, 'APIMATIC-BUILD.json');
        const buildFileContent = JSON.parse(fs.readFileSync(buildFilePath, 'utf8'));
    
        const languageConfig = languages.reduce((config, lang) => {
            config[lang] = {};
            return config;
        }, {} as { [key: string]: object });
    
        buildFileContent.generatePortal.languageConfig = languageConfig;
    
        fs.writeFileSync(buildFilePath, JSON.stringify(buildFileContent, null, 2));
        
        const specFolder = path.join(targetFolder, 'spec');
    
        const metadataFile = fs.readdirSync(specFolder).find(file => file.startsWith("APIMATIC-META"));
    
        if (!metadataFile) {
            const newMetadataContent = {
                ImportSettings: {
                    "AutoGenerateTestCases": false,
                    "ImportAdditionalHeader": false,
                    "ImportAdditionalTypeCombinatorModels": false,
                    "ImportTypeCombinatorsWithOnlyOneType": false
                },
                CodeGenSettings: {
                    "Timeout": 30,
                    "ValidateRequiredParameters": true,
                    "AddSingleAuthDeprecatedCode": false,
                    "EnableGlobalUserAgent": true,
                    "UserAgent": "{language}-SDK/{version} [OS: {os-info}, Engine: {engine}/{engine-version}]",
                    "EnableLogging": true,
                    "EnableModelKeywordArgsInRuby": true,
                    "SymbolizeHashKeysInRuby": true,
                    "ReturnCompleteHttpResponse": true,
                    "UserConfigurableRetries": true,
                    "UseEnumPrefix": false,
                    "ExtendedAdditionalPropertiesSupport": true,
                    "EnforceStandardizedCasing": true,
                    "ControllerPostfix": "Api",
                    "DoNotSplitWords": ["oauth"]
                }
            };
    
            const newMetadataFilePath = path.join(specFolder, 'APIMATIC-META.json');
            fs.writeFileSync(newMetadataFilePath, JSON.stringify(newMetadataContent, null, 2));
        }
    }

    async generatePortalArtifacts(targetFolder: string, configDir: string, overrideAuthKey: string | null) : Promise<string> {
        const generatedPortalPath = path.join(targetFolder, 'api-portal');
        
        try {
            await generatePortal(targetFolder, generatedPortalPath, configDir, overrideAuthKey);
            return generatedPortalPath;
        } catch (error) {
            throw new Error(getMessageInRedColor(`Something went wrong while generating the portal artifacts: ${error}`));
        }
    }

    async servePortal(generatedPortalPath: string, targetFolder: string, configDir: string, authKey: string | null) : Promise<void> {
        const server = new PortalServerService();

        server.setupServer(generatedPortalPath);

        server.startServer({
            generatedPortalPath,
            targetFolder,
            configDir,
            authKey
        });
    }
}