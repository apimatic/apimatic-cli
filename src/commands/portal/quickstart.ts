import { flags, Command } from '@oclif/command';
import { intro, outro, confirm, text, spinner, multiselect, log } from '@clack/prompts';
import { getValidation } from '../../controllers/api/validate';
import simpleGit from 'simple-git';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';
import * as fsextra from 'fs-extra';
import { staticPortalRepoUrl } from '../../config/env';
import { clearDirectory, isValidUrl, unzipFile, replaceHTML, directoryToJson } from '../../utils/utils';
import { APIValidationExternalApisController, ApiValidationSummary, Client } from '@apimatic/sdk';
import { SDKClient } from '../../client-utils/sdk-client';
import * as filetype from 'file-type';
import * as treeify from 'treeify';

export default class PortalQuickstart extends Command {
  static description = 'Get started with generating static docs portal';

  static flags = {
    "auth-key": flags.string({  description: "override current authentication state with an authentication key" }),
  }; // Add flags here if needed
  
  static examples = [
    '$ apimatic portal:quickstart',
  ];

  
  static args = [];  // Add positional arguments here if needed
  //Common flags for all commands:
  /* 
  --authKey
  --debug
  --help or -h
  --timeout
  --wait-on-ratelimit
  */
  async run() {
    const { args , flags } = this.parse(PortalQuickstart);
    const git = simpleGit();
    
    const spin = spinner();
    let targetFolder: string;
    let filePath : string;
    
    try 
    {
      const overrideAuthKey = flags["auth-key"] ? flags["auth-key"] : null;
      const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, this.config.configDir);

      const apiValidationController: APIValidationExternalApisController = new APIValidationExternalApisController(
        client
      );

      intro("Welcome to the quickstart guide for generating static docs portal! 🚀");

      const directory = await text({
        message: "Please enter the directory path where you would like to setup the portal:",
        placeholder: "Enter absolute path to the directory or leave it empty to use the current directory.",
        defaultValue: "./",//Sets the default value with placeholder showing.
        // initialValue: "huhu"//Sets the value in the cmd. removes placeholder.    
        validate: (input) => {
          if (!fs.existsSync(path.resolve(input))) {
            return "The directory path does not exist.";
          }
        }
      });

      if (directory === "./") {
        targetFolder = path.join(process.cwd(), 'apimatic-quickstart-portal');
      }
      else {
        targetFolder = path.join(String(directory), 'apimatic-quickstart-portal');
      };

      spin.start("Setting up your portal...");
      await git.clone(staticPortalRepoUrl, targetFolder);
      await clearDirectory(path.join(targetFolder, '.github'));
      spin.stop("Portal setup complete! ✅");
      // outro("You're all set!");

      const spec = await text({
        message: "Please enter the directory path or URL to your spec file:",
        placeholder: "Leave the field empty to use a sample spec.",
        // defaultValue: "./",//Sets the default value with placeholder showing.
        // initialValue: "huhu"//Sets the value in the cmd. removes placeholder.    
        validate: (input) => {
          if (!isValidUrl && !fs.existsSync(path.resolve(input)) ) {
            this.error("The directory path does not exist.");
          }
        }
      });

      if (spec)
      {
        try {
          const specPath = String(spec);
          spin.start("Setting up your spec...");
          const specFolder = path.join(targetFolder, 'spec');
          
          await clearDirectory(specFolder);
          await fsextra.ensureDir(specFolder);

          if (isValidUrl(specPath)) {
            const response = await axios.get(specPath, { responseType: 'arraybuffer' });
            const fileName = path.basename(specPath);
            filePath = path.join(specFolder, fileName);
            await fsextra.writeFile(filePath, response.data);
          }
          else {
            filePath = specFolder;
            
            const fileType = await filetype.fromFile(specPath);
            
            if (fileType?.ext === 'zip')
            {
              log.step("Zip file detected. Unzipping the file...\n");
              await unzipFile(fs.createReadStream(specPath), specFolder);
            }
            else {
              await fsextra.copy(String(specPath), specFolder);
            }
          }

          spin.stop("Spec setup complete! ✅");
        }
        catch (error) {
          this.error(`Error while copying your spec: ${error}`);
        }
      }
      else {
        filePath = path.join(targetFolder, 'spec', 'Apimatic-Calculator.json');
      }

      // const sleep = promisify(setTimeout);

      const validationFlags = {
        file: filePath,
        url: "",
        "auth-key": flags["auth-key"]
      };

      spin.start("Validating your spec...");
      // await sleep(2000);
      const validationSummary: ApiValidationSummary = await getValidation(validationFlags, apiValidationController);
      
      
      spin.stop("Validation complete. Here are the issues we found:");

      for (const error of validationSummary.errors) {
        // this.log(`${kleur.red(`Error: ${error} `)}`);
        log.error(`Error: ${replaceHTML(error)}`);
      }
      for (const warning of validationSummary.warnings) {
        // this.log(`${kleur.yellow(`Warning: ${warning} `)}`);
        log.warn(`Warning: ${replaceHTML(warning)}`);
      }
      for (const message of validationSummary.messages) {
        // this.log(`${kleur.blue(`Message: ${message} `)}`);
        log.info(`Information: ${replaceHTML(message)}`);
      }

      const hyperlink = '\u001b]8;;https://marketplace.visualstudio.com/items?itemName=apimatic-developers.apimatic-for-vscode\u001b\\APIMatic\'s dedicated VS Code Extension\u001b]8;;\u001b\\';
      log.info(`You can use ${hyperlink} to fix your errors and warnings. 🔍`);

      const addDefaultCodeGenSettings = await confirm({
        message: `Would you like to enable default code generation settings for your portal? 
        ⚠️  Warning: These will overwrite some of your existing CodeGen and Import settings in the metadata file (if any).`,
      });

      if (addDefaultCodeGenSettings) {
        spin.start("Setting up default code generation settings...");

        const specFolder = path.join(targetFolder, 'spec');

        const metadataFile = fs.readdirSync(specFolder).find(file => file.startsWith("APIMATIC-META"));

        if (metadataFile) {
          const metadataFilePath = path.join(specFolder, metadataFile);
          const metadataContent = JSON.parse(fs.readFileSync(metadataFilePath, 'utf8'));

          metadataContent.ImportSettings = {
            "AutoGenerateTestCases": false,
            "ImportAdditionalHeader": false,
            "ImportAdditionalTypeCombinatorModels": false,
            "ImportTypeCombinatorsWithOnlyOneType": false
          }

          metadataContent.CodeGenSettings = {
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
          };

          fs.writeFileSync(metadataFilePath, JSON.stringify(metadataContent, null, 2));
        }
        else {
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

        spin.stop("Default code generation settings setup complete! ✅");
      }

      const languages = await multiselect({
        message: "Which languages would you like to enable for the portal? Use arrow keys and the spacebar to select options.",
        options: [
          { label: "HTTP", value: "http" },
          { label: "Typescript", value: "typescript" },
          { label: "Ruby", value: "ruby" },
          { label: "Python", value: "python" },
          { label: "Java", value: "java" },
          { label: "C#", value: "csharp" },
          { label: "PHP", value: "php" },
          { label: "Go", value: "go" },
        ],
      }) as string[];

      spin.start("Setting up languages...");

      const buildFilePath = path.join(targetFolder, 'APIMATIC-BUILD.json');
      let buildFileContent = JSON.parse(fs.readFileSync(buildFilePath, 'utf8'));

      const languageConfig = languages.reduce((config, lang) => {
        config[lang] = {};
        return config;
      }, {} as { [key: string]: object });

      buildFileContent.generatePortal.languageConfig = languageConfig;

      fs.writeFileSync(buildFilePath, JSON.stringify(buildFileContent, null, 2));

      spin.stop("Languages setup complete! ✅");


      const publishDebugReport = await confirm({
        message: "Would you like to publish a debug report for the generated portal? This can help you debug issues that may have occurred while setting up your portal.",
      });

      if (publishDebugReport)
      {
        buildFileContent = JSON.parse(fs.readFileSync(buildFilePath, 'utf8'));

        buildFileContent.generatePortal.debug = {
          "publishReport": true
        };

        fs.writeFileSync(buildFilePath, JSON.stringify(buildFileContent, null, 2));

        log.success("Debug report publishing enabled! ✅");
      }

      log.info("Here is what the portal directory looks like:");

      const buildDirectory = directoryToJson(targetFolder) as treeify.TreeObject;

      const tree = treeify.asTree(buildDirectory, false, true);

      log.info(tree);

      outro("You're all set! 🎉");
    }
    catch (error) {
      this.error(`Unable to setup the portal: ${error}`);
    }
  }
}