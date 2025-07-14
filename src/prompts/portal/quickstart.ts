import fs from "fs";
import * as path from "path";
import treeify from "treeify";
import { intro, outro, text, spinner, select, multiselect, log, isCancel, cancel, password } from "@clack/prompts";
import {
  getMessageInCyanColor,
  getMessageInGreenColor,
  getMessageInOrangeColor,
  getMessageInMagentaColor,
  getMessageInRedColor,
  isValidUrl,
  directoryToJson
} from "../../utils/utils.js";

export class PortalQuickstartPrompts {
  private readonly spin = spinner();
  private readonly vscodeExtensionUrl =
    "\u001b[4mhttps://marketplace.visualstudio.com/items?itemName=apimatic-developers.apimatic-for-vscode\u001b[0m";
  private readonly serverUrl = "\u001b[4mhttp://localhost:3000\u001b[0m";
  private readonly referenceDocumentationUrl =
    "\u001b[4mhttps://docs.apimatic.io/platform-api/#/http/guides/generating-on-prem-api-portal/overview-generating-api-portal\u001b[0m";
  private readonly customizeTheSdksUrl =
    "\u001b[4mhttps://docs.apimatic.io/generate-sdks/codegen-settings/codegen-settings-overview\u001b[0m";
  private readonly defaultPortalDirectoryPath = process.cwd();

  displayWelcomeMessage(): void {
    intro(`Hello there 👋`);
    log.message(
      `This wizard will help you set up an API Portal via APIMatic's Docs as Code workflow in 4 simple steps.`
    );
    log.message(`Let's get started! 🚀`);
    log.message(`Note: Quickstart requires an empty directory.`)
  }

  async loginPrompt(): Promise<{ email: string; password: string }> {
    log.message(`Please log in to continue.`);

    const email = await text({
      message: "Enter your registered email:",
      validate: (input) => {
        if (!input) {
          return getMessageInRedColor("Email is required.");
        }

        const emailRegex =
          /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

        if (!emailRegex.test(input)) {
          return getMessageInRedColor("Please enter a valid email address.");
        }
      }
    });

    if (isCancel(email)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    const pass = await password({
      message: "Enter your password:",
      validate: (input) => {
        if (!input) {
          return getMessageInRedColor("Password is required.");
        }
      }
    });

    if (isCancel(pass)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    return { email: String(email).trim(), password: String(pass).trim() };
  }

  displayLoggingInMessage(): void {
    this.spin.start(getMessageInMagentaColor("Logging in"));
  }

  displayLoggingInErrorMessage(): void {
    this.spin.stop(
      getMessageInRedColor(`There was a problem logging in. Please verify your credentials and try again.`)
    );
  }

  displayLoggedInMessage(): void {
    this.spin.stop(getMessageInCyanColor("✅  Login successful!"));
  }

  removeQuotes(str: string) {
    const trimmed = str.trim();
    const quotes = ['"', "'"];
    
    for (const quote of quotes) {
        if (trimmed.startsWith(quote) && trimmed.endsWith(quote) && trimmed.length > 1) {
            return trimmed.slice(1, -1);
        }
    }
    return trimmed;
}

  async specPrompt(): Promise<string> {
    log.step(getMessageInOrangeColor(`Step 1 of 4: Import your OpenAPI Definition`));

    const spec = await text({
      message: `Provide a local path or a public URL for your OpenAPI Definition file:`,
      placeholder: "Enter Absolute URL or Press Enter to use sample OpenAPI file for APIMatic",
      defaultValue: "https://raw.githubusercontent.com/apimatic/static-portal-workflow/refs/heads/master/spec/Apimatic-Calculator.json",
      validate: (input) => {
        if (!input) return;

        if (isValidUrl(input)) return;

        const cleanedPath = this.removeQuotes(input ?? "");
        const dirPath = path.resolve(cleanedPath);

        if (fs.existsSync(dirPath)) {
          if (fs.statSync(dirPath).isFile()) {
            return;
          }

          return getMessageInRedColor(
            "Error: The specified path does not point to a valid API Definition file or a zip archive containing API definition files. Please try again."
          );
        }

        return getMessageInRedColor("Error: The specified file does not exist. Please enter a valid file path.");
      }
    });

    if (isCancel(spec)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    return String(spec).trim();
  }

  displaySpecValidationMessage(): void {
    log.step(getMessageInOrangeColor(`Step 2 of 4: Validate and Lint your OpenAPI file`));
    this.spin.start(
      getMessageInMagentaColor(
        `Running your API Definition through APIMatic's 1200+ CodeGen Specific validation and linting rules 🔍 `
      )
    );
  }

  displaySpecValidationSuccessMessage(): void {
    this.spin.stop(getMessageInCyanColor(`✅  Validation Successful.`));
  }

  displaySpecValidationErrorMessage(): void {
    this.spin.stop(getMessageInRedColor(`Something went wrong while validating your spec.`));
  }

  displaySpecValidationFailureMessage(): void {
    this.spin.stop(getMessageInRedColor(`❗ Oops, it looks like there are some errors in your API Definition.`));
  }

  async specValidationFailurePrompt(): Promise<void> {
    const useSampleSpec = await select({
      message: `How would you like to proceed?`,
      options: [
        {
          value: "exit",
          label: `1. Fix the issues using APIMatic's interactive VS Code Extension: ${this.vscodeExtensionUrl}`
        },
        { value: "continue", label: `2. Use an example API spec instead (recommended)` }
      ]
    });

    if (isCancel(useSampleSpec)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    if (useSampleSpec === "exit") {
      outro(
        getMessageInCyanColor(
          "Good luck fixing your API definition! 🛠️  Feel free to run this command again once you're done."
        )
      );
      return process.exit(0);
    }
  }

  async sdkLanguagesPrompt(): Promise<string[]> {
    log.step(getMessageInOrangeColor(`Step 3 of 4: Select programming languages`));

    const languages = (await multiselect({
      message:
        "💻 Your API Portal will contain SDKs and SDK Documentation in the following Languages. Press enter to continue with all languages, or use the arrow keys and spacebar to customize your selection:",
      options: [
        { label: "HTTP", value: "http" },
        { label: "Typescript", value: "typescript" },
        { label: "Ruby", value: "ruby" },
        { label: "Python", value: "python" },
        { label: "Java", value: "java" },
        { label: "C#", value: "csharp" },
        { label: "PHP", value: "php" },
        { label: "Go", value: "go" }
      ],
      initialValues: ["http", "typescript", "ruby", "python", "java", "csharp", "php", "go"]
    })) as string[];

    if (isCancel(languages)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    return languages;
  }

  async buildDirectoryPrompt(): Promise<string> {
    log.step(getMessageInOrangeColor(`Step 4 of 4: Generate source files for Docs as Code`));

    const directory = await text({
      message: "Enter the directory path where you would like to setup the API Portal :",
      placeholder: "Enter absolute path to the directory or leave it empty to use the current directory.",
      defaultValue: "./",
      validate: (input) => {
        const cleanedPath = this.removeQuotes(input ?? "");
        const dirPath = path.resolve(cleanedPath);

        if (!fs.existsSync(dirPath) && dirPath != this.defaultPortalDirectoryPath) {
          return getMessageInRedColor("Error: The specified directory path does not exist. Please try again.");
        }

        if (dirPath !== this.defaultPortalDirectoryPath) {
          const files = fs.readdirSync(dirPath).filter((item) => !item.startsWith("."));
          if (files.length > 0) {
            return getMessageInRedColor(
              "Error: The target directory is not empty. Please provide a path to an empty directory or clear its contents."
            );
          }
        } else if (fs.existsSync(dirPath) && fs.readdirSync(dirPath).length > 0) {
          return getMessageInRedColor(
            "Error: The target directory is not empty. Please provide a path to an empty directory or clear its contents."
          );
        }
      }
    });

    if (isCancel(directory)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    if (directory === "./") {
      return this.defaultPortalDirectoryPath;
    } else {
      return String(directory).trim();
    }
  }

  displayBuildDirectoryGenerationMessage(): void {
    this.spin.start(getMessageInMagentaColor("Generating build directory... ⚙️"));
  }

  displayBuildDirectoryGenerationErrorMessage(): void {
    this.spin.stop(getMessageInRedColor(`Something went wrong while setting up your build directory.`));
  }

  displayBuildDirectoryGenerationSuccessMessage(targetFolder: string): void {
    this.spin.stop(getMessageInCyanColor(`📁 Directory created at ${targetFolder}`));
  }

  displayBuildDirectoryAsTree(targetFolder: string): void {
    const buildDirectory = directoryToJson(targetFolder) as treeify.TreeObject;

    const tree = treeify.asTree(buildDirectory, true, true);

    const coloredLogString = tree
      .split("\n")
      .map((line) => line.replace(/#.*/, (match) => getMessageInGreenColor(match)))
      .join("\n");

    log.info(coloredLogString);
  }

  displayPortalGenerationMessage(): void {
    this.spin.start(getMessageInMagentaColor("Setting up portal"));
  }

  displayPortalGenerationSuccessMessage(): void {
    this.spin.stop(getMessageInCyanColor("✅  Portal setup complete!"));
  }

  displayOutroMessage(directory: string): void {
    log.step(
      getMessageInCyanColor(`📢  Your API Portal is live at: ${this.serverUrl}\n`) +
        getMessageInCyanColor(
          `Hot reload enabled! Edit files in ${directory} to see changes instantly reflected in your API Portal.\n`
        ) +
        getMessageInCyanColor(`Press CTRL+C to stop the server.`)
    );
    outro(
      getMessageInCyanColor(`What's next?\n`) +
        getMessageInCyanColor(`- Check out the Interactive Playground in your API Portal.\n`) +
        getMessageInCyanColor(
          `- Read the reference documentation to learn more about how you can customize this API Portal: ${this.referenceDocumentationUrl}`
        ) +
        getMessageInCyanColor(` \n`) +
        getMessageInCyanColor(
          `- Review the SDK Documentation for your favourite programming language and download an SDK from the API Portal.\n`
        ) +
        getMessageInCyanColor(
          `- Check out how you can customize the SDKs using Code Generation settings: ${this.customizeTheSdksUrl}`
        )
    );
  }
}
