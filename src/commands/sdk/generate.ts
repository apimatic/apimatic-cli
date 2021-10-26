import { Command, flags } from "@oclif/command";

export default class SdkGenerate extends Command {
  static description = "Generate SDKs for your APIs";

  static flags = {
    help: flags.help({ char: "h" }),
    platform: flags.enum({
      options: [
        "CSNETSTANDARDLIB",
        "CSPORTABLENETLIB",
        "CSUNIVERSALWINDOWSPLATFORMLIB",
        "JAVAGRADLEANDROIDLIB",
        "OBJCCOCOATOUCHIOSLIB",
        "JAVAECLIPSEJRELIB",
        "PHPGENERICLIB",
        "PYTHONGENERICLIB",
        "RUBYGENERICLIB",
        "ANGULARJAVASCRIPTLIB",
        "NODEJAVASCRIPTLIB",
        "GOGENERICLIB",
        "HTTPCURLV1"
      ],
      description: "Platform for which SDK should be generated for"
    }),
    file: flags.string({ default: "", description: "Path to specification file to generate SDK for" }),
    url: flags.string({ default: "", description: "URL to specification file to generate SDK for" }),
    destination: flags.string({ default: "./", description: "Path to download the generated SDK to" }),
    "api-entity": flags.string({ default: "", description: "URL to specification file to generate SDK for" }),
    "auth-key": flags.string({
      default: "",
      description: "Override current auth-key by providing authentication key in the command"
    })
  };

  static examples = [
    `$ apimatic sdk:generate --platform="CSNETSTANDARDLIB" --file="./specs/sample.json"
File has been successfully transformed into OpenApi3Json
`
  ];

  static args = [{ name: "file" }];

  async run() {
    const { flags } = this.parse(SdkGenerate);

    this.log(flags["auth-key"]);
  }
}
