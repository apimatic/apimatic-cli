import simpleGit from 'simple-git';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';
import * as fsextra from 'fs-extra';
import * as express from "express";
import * as livereload from "livereload";
import * as connectLivereload from "connect-livereload";
import * as filetype from 'file-type';
import * as treeify from 'treeify';
import { flags, Command } from '@oclif/command';
import { intro, outro, text, spinner, select, multiselect, log } from '@clack/prompts';
import { getValidation } from '../../controllers/api/validate';
import { staticPortalRepoUrl } from '../../config/env';
import { clearDirectory, isValidUrl, unzipFile, directoryToJson, createTempDirectory, deleteFile, getMessageInCyanColor, getMessageInGreenColor, getMessageInBlueColor, getMessageInOrangeColor, getMessageInMagentaColor, getMessageInRedColor } from '../../utils/utils';
import { APIValidationExternalApisController, ApiValidationSummary, Client } from '@apimatic/sdk';
import { SDKClient } from '../../client-utils/sdk-client';
import { GetValidationParams } from '../../types/api/validate';
import { generatePortal, watchAndRegeneratePortal } from '../../controllers/portal/serve';
import { red, cyan, blue, green, magenta, yellow, italic, underline, bold } from 'kleur';

export default class PortalQuickstart extends Command {
  static description = 'Get started with generating static docs portal';

  static flags = {
    "auth-key": flags.string({  
      description: "override current authentication state with an authentication key" 
    }),
  };
   
  static examples = [
    '$ apimatic portal:quickstart --auth-key="yourAuthKey"',
  ];

  async run() {
    const { flags } = this.parse(PortalQuickstart);
    const spin = spinner();
    const tempSpecDir = await createTempDirectory();
    let targetFolder: string;
    
    const overrideAuthKey = flags["auth-key"] ? flags["auth-key"] : null;
    const client: Client = await SDKClient.getInstance().getClient(overrideAuthKey, this.config.configDir);
    const apiValidationController: APIValidationExternalApisController = new APIValidationExternalApisController(
      client
    );

    intro((`Hello there 👋`));

    log.message((`This wizard will help you set up an API Portal via APIMatic's Docs as Code workflow in 4 simple steps.`));

    log.message((`Let's get started! 🚀`));

    log.step(getMessageInBlueColor(`Step 1 of 4: Import your OpenAPI Definition`));

    //Get spec file.

    const spec = await text({
      message: `Provide a local path or a public URL for your OpenAPI Definition file:`,
      placeholder: "Press Enter to use a sample OpenAPI file for APIMatic",
      defaultValue: "",
      validate: (input) => {
        if (!isValidUrl && !fs.existsSync(path.resolve(input)) ) {
          throw new Error(red().bold("The directory path does not exist."));
        }
      }
    });

    const specFile = await this.getSpecFile(tempSpecDir, String(spec));

    //Validate spec file.

    log.step(getMessageInBlueColor(`Step 2 of 4: Validate and Lint your OpenAPI file`));
    
    spin.start(getMessageInMagentaColor(`Running your API Definition through APIMatic's 1200+ CodeGen Specific validation and linting rules 🔍 `));
    
    const validationFlags: GetValidationParams = {
      file: specFile.filePath,
      url: specFile.url
    };
    
    const validationSummary: ApiValidationSummary = await getValidation(validationFlags, apiValidationController);

    if (!validationSummary.success)
    {
      spin.stop(getMessageInRedColor(`❗ Oops, it looks like there are some errors in your API Definition.`));
      const vscodeExtensionUrl = '\u001b]8;;https://marketplace.visualstudio.com/items?itemName=apimatic-developers.apimatic-for-vscode\u001b\\APIMatic\'s interactive VS Code Extension\u001b]8;;\u001b\\';
      const useSampleSpec = await select({
        message: `How would you like to proceed?`,
        options: [
          { value: 'exit', label: `1. Fix the issues using ${vscodeExtensionUrl}.`},
          { value: 'continue', label: `2. Use an example API spec instead (recommended)`},
        ],
      });

      if (useSampleSpec === 'exit')
      {
        outro(getMessageInCyanColor("Good luck fixing your API definition! 🛠️  Feel free to run this command again once you're done."));
        process.exit(0);
      }
    }
    else {
      spin.stop(getMessageInCyanColor(`✅  Validation Successful.`));
    }

    //Setup languages.

    log.step(getMessageInBlueColor(`Step 3 of 4: Select programming languages`));

    const languages = await multiselect({
      message: "💻 Select SDKs and Documentation languages for your API Portal. Press enter to include all, or use the arrow keys and spacebar to customize your selection:",
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
      initialValues: [
        "http",
        "typescript",
        "ruby",
        "python",
        "java",
        "csharp",
        "php",
        "go"
      ]
    }) as string[];

    log.step(getMessageInBlueColor(`Step 4 of 4: Generate source files for Docs as Code`));

    const directory = await text({
      message: "Enter the directory path where you would like to setup the API Portal :",
      placeholder: "Enter absolute path to the directory or leave it empty to use the current directory.",
      defaultValue: "./", 
      validate: (input) => {
        if (!fs.existsSync(path.resolve(input))) {
          throw new Error(red().bold("The directory path does not exist."));
        }
      }
    });

    if (directory === "./") {
      targetFolder = path.join(process.cwd(), 'apimatic-quickstart-portal');
    }
    else {
      targetFolder = path.join(String(directory), 'apimatic-quickstart-portal');
    };

    //Setup build directory.

    spin.start(getMessageInMagentaColor("Generating build directory... ⚙️"));
    
    await this.setupBuildDirectory(targetFolder, specFile, validationSummary, languages);
    
    spin.stop(getMessageInCyanColor(`📁 Directory created at ${targetFolder}`));

    //Print the build directory as a tree.

    const buildDirectory = directoryToJson(targetFolder) as treeify.TreeObject;

    const tree = treeify.asTree(buildDirectory, true, true);

    const coloredLogString = tree.replace(/(#.*?$)/gm, (match) => getMessageInGreenColor(match));

    log.info(coloredLogString);

    //Generate portal artifacts.

    const generatedPortalPath = path.join(targetFolder, 'api-portal');

    try {
      spin.start(getMessageInMagentaColor("Setting up portal"));
      await generatePortal(targetFolder, generatedPortalPath, this.config.configDir, overrideAuthKey);
      spin.stop(getMessageInCyanColor("\x1b[1K✅  Portal setup complete!"));
    } catch (error) {
      throw new Error(red().bold(`Something went wrong while generating the portal artifacts: ${error}`));
    }

    //Serve the portal.

    const app = express();
    
    const liveReloadServer = livereload.createServer();
    liveReloadServer.watch(generatedPortalPath);

    app.use(connectLivereload());

    app.use(express.static(generatedPortalPath));

    const server = app.listen(3000, () => {
      const serverUrl = '\u001b[4mhttp://localhost:3000\u001b[0m';
      const referenceDocumentation = '\u001b]8;;https://docs.apimatic.io/platform-api/#/http/guides/generating-on-prem-api-portal/overview-generating-api-portal\u001b\\\u001b[4mreference documentation\u001b[0m\u001b]8;;\u001b\\';
      const customizeTheSdks = '\u001b]8;;https://docs.apimatic.io/generate-sdks/codegen-settings/codegen-settings-overview/\u001b\\\u001b[4mcustomize the SDKs\u001b[0m\u001b]8;;\u001b\\';
      
      log.step(
        getMessageInCyanColor(`📢  Your API Portal is live at: ${serverUrl}\n`) +
        getMessageInCyanColor(`Hot reload enabled! Edit files in ./api-portal to see changes instantly reflected in your API Portal.\n`) +
        getMessageInCyanColor(`Press CTRL+C to stop the server.\n\n`) +
        getMessageInCyanColor(`What's next?\n`) +
        getMessageInCyanColor(`- Check out the Interactive Playground in your API Portal.\n`) +
        getMessageInCyanColor(`- Read the ${referenceDocumentation}`) + getMessageInCyanColor(` to learn more about how you can customize this API Portal.\n`) +
        getMessageInCyanColor(`- Review the SDK Documentation for your favourite programming language and download an SDK from the API Portal.\n`) +
        getMessageInCyanColor(`- Check out how you can ${customizeTheSdks}`) + getMessageInCyanColor(` using Code Generation settings.`)
      );
    });

    watchAndRegeneratePortal(targetFolder, generatedPortalPath, this.config.configDir, overrideAuthKey);
    
    if (process.stdin.setRawMode)
    {
      process.stdin.setRawMode(false);
    }

    return new Promise<void>((resolve) => {
      const shutdown = async () => {
        liveReloadServer.close();
        server.close(() => {
          resolve();
          process.exit(0);
        });
      };
    
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    });
  }

  private async getSpecFile(tempSpecDir: string, spec?: string): Promise<{ filePath: string; url: string }> {
    let filePath = "";
    const url = "https://github.com/apimatic/static-portal-workflow/blob/master/spec/Apimatic-Calculator.json";
  
    if (spec) {
      const specPath = String(spec);
  
      if (isValidUrl(specPath)) {
        try {
          const specFile = await axios.get(specPath, { responseType: 'arraybuffer' });
          const fileName = path.basename(specPath);
          filePath = path.join(tempSpecDir, fileName);
          await fsextra.writeFile(filePath, specFile.data);
        } catch (error) {
          throw new Error(red().bold(`There was an error fetching your spec: ${error}`));
        }
      } else {
        if (fs.statSync(specPath).isDirectory()) {
          throw new Error(red().bold('Directory paths are not supported, please enter a path to a valid file or zip file instead.'));
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
  
    return { filePath, url };
  }

  private async setupBuildDirectory(targetFolder: string, specFile: { filePath: string, url: string}, validationSummary: ApiValidationSummary, languages : string[]) {
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
}