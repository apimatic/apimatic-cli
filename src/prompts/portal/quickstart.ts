import * as fs from "fs";
import * as path from "path";
import * as treeify from "treeify";
import { intro, outro, text, spinner, select, multiselect, log, isCancel, cancel, password } from "@clack/prompts";
import {
  getMessageInCyanColor,
  getMessageInGreenColor,
  getMessageInOrangeColor,
  getMessageInMagentaColor,
  getMessageInRedColor,
  isValidUrl,
  directoryToJson
} from "../../utils/utils";

export class PortalQuickstartPrompts {
  private spin = spinner();
  private vscodeExtensionUrl =
    "\u001b]8;;https://marketplace.visualstudio.com/items?itemName=apimatic-developers.apimatic-for-vscode\u001b\\APIMatic's interactive VS Code Extension\u001b]8;;\u001b\\";
  private serverUrl = "\u001b[4mhttp://localhost:3000\u001b[0m";
  private referenceDocumentation =
    "\u001b]8;;https://docs.apimatic.io/platform-api/#/http/guides/generating-on-prem-api-portal/overview-generating-api-portal\u001b\\\u001b[4mreference documentation\u001b[0m\u001b]8;;\u001b\\";
  private customizeTheSdks =
    "\u001b]8;;https://docs.apimatic.io/generate-sdks/codegen-settings/codegen-settings-overview/\u001b\\\u001b[4mcustomize the SDKs\u001b[0m\u001b]8;;\u001b\\";
  private portalDirectory = "apimatic-quickstart-portal";

  displayWelcomeMessage(): void {
    intro(`Hello there 👋`);
    log.message(
      `This wizard will help you set up an API Portal via APIMatic's Docs as Code workflow in 4 simple steps.`
    );
    log.message(`Let's get started! 🚀`);
  }

  async loginPrompt(): Promise<{ email: string; password: string }> {
    log.message(`Please log in to continue.`);

    const email = await text({
      message: "Enter your registered email:",
      validate: (input) => {
        if (!input) {
          return getMessageInRedColor("Email is required.");
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

    return { email: String(email), password: String(pass) };
  }

  displayLoggingInMessage(): void {
    this.spin.start(getMessageInMagentaColor("Logging in"));
  }

  displayLoggedInMessage(): void {
    this.spin.stop(getMessageInCyanColor("✅  Login successful!"));
  }

  async specPrompt(): Promise<string> {
    log.step(getMessageInOrangeColor(`Step 1 of 4: Import your OpenAPI Definition`));

    const spec = await text({
      message: `Provide a local path or a public URL for your OpenAPI Definition file:`,
      placeholder: "Press Enter to use a sample OpenAPI file for APIMatic",
      defaultValue: "",
      validate: (input) => {
        if (!isValidUrl && !fs.existsSync(path.resolve(input))) {
          return getMessageInRedColor("The directory path does not exist.");
        }
      }
    });

    if (isCancel(spec)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    return String(spec);
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

  displaySpecValidationFailureMessage(): void {
    this.spin.stop(getMessageInRedColor(`❗ Oops, it looks like there are some errors in your API Definition.`));
  }

  async specValidationFailurePrompt(): Promise<void> {
    const useSampleSpec = await select({
      message: `How would you like to proceed?`,
      options: [
        { value: "exit", label: `1. Fix the issues using ${this.vscodeExtensionUrl}.` },
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
      process.exit(0);
    }
  }

  async sdkLanguagesPrompt(): Promise<string[]> {
    log.step(getMessageInOrangeColor(`Step 3 of 4: Select programming languages`));

    const languages = (await multiselect({
      message:
        "💻 Select SDKs and Documentation languages for your API Portal. Press enter to include all, or use the arrow keys and spacebar to customize your selection:",
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
        if (!fs.existsSync(path.resolve(input))) {
          return getMessageInRedColor("The directory path does not exist.");
        }
      }
    });

    if (isCancel(directory)) {
      cancel("Operation cancelled.");
      return process.exit(0);
    }

    if (directory === "./") {
      return path.join(process.cwd(), this.portalDirectory);
    } else {
      return path.join(String(directory), this.portalDirectory);
    }
  }

  displayBuildDirectoryGenerationMessage(): void {
    this.spin.start(getMessageInMagentaColor("Generating build directory... ⚙️"));
  }

  displayBuildDirectoryGenerationSuccessMessage(targetFolder: string): void {
    this.spin.stop(getMessageInCyanColor(`📁 Directory created at ${targetFolder}`));
  }

  displayBuildDirectoryAsTree(targetFolder: string): void {
    const buildDirectory = directoryToJson(targetFolder) as treeify.TreeObject;

    const tree = treeify.asTree(buildDirectory, true, true);

    const coloredLogString = tree.replace(/(#.*?$)/gm, (match) => getMessageInGreenColor(match));

    log.info(coloredLogString);
  }

  displayPortalGenerationMessage(): void {
    this.spin.start(getMessageInMagentaColor("Setting up portal"));
  }

  displayPortalGenerationSuccessMessage(): void {
    this.spin.stop(getMessageInCyanColor("✅  Portal setup complete!"));
  }

  displayOutroMessage(): void {
    log.step(
      getMessageInCyanColor(`📢  Your API Portal is live at: ${this.serverUrl}\n`) +
        getMessageInCyanColor(
          `Hot reload enabled! Edit files in ./apimatic-quickstart-portal to see changes instantly reflected in your API Portal.\n`
        ) +
        getMessageInCyanColor(`Press CTRL+C to stop the server.\n\n`) +
        getMessageInCyanColor(`What's next?\n`) +
        getMessageInCyanColor(`- Check out the Interactive Playground in your API Portal.\n`) +
        getMessageInCyanColor(`- Read the ${this.referenceDocumentation}`) +
        getMessageInCyanColor(` to learn more about how you can customize this API Portal.\n`) +
        getMessageInCyanColor(
          `- Review the SDK Documentation for your favourite programming language and download an SDK from the API Portal.\n`
        ) +
        getMessageInCyanColor(`- Check out how you can ${this.customizeTheSdks}`) +
        getMessageInCyanColor(` using Code Generation settings.\n`)
    );
  }
}
