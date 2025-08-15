import { expect } from "chai";
import { Parser } from "@oclif/core";
/* eslint-env mocha */
/* eslint-disable no-undef */
import * as path from "path";
import { pathToFileURL } from "node:url";
import stringArgv from "string-argv";

type CommandMapping = {
  id: string;
  fileParts: string[]; // relative to lib/
  exportName?: string; // default export if omitted
};

const COMMANDS: CommandMapping[] = [
  { id: "api:transform", fileParts: ["commands", "api", "transform.js"] },
  { id: "api:validate", fileParts: ["commands", "api", "validate.js"] },
  { id: "auth:login", fileParts: ["commands", "auth", "login.js"] },
  { id: "auth:logout", fileParts: ["commands", "auth", "logout.js"] },
  { id: "auth:status", fileParts: ["commands", "auth", "status.js"] },
  { id: "portal:generate", fileParts: ["commands", "portal", "generate.js"], exportName: "PortalGenerate" },
  { id: "portal:recipe:new", fileParts: ["commands", "portal", "recipe", "new.js"] },
  { id: "portal:serve", fileParts: ["commands", "portal", "serve.js"] },
  { id: "portal:copilot", fileParts: ["commands", "portal", "copilot.js"] },
  { id: "portal:toc:new", fileParts: ["commands", "portal", "toc", "new.js"] },
  { id: "portal:quickstart", fileParts: ["commands", "portal", "quickstart.js"] },
  { id: "sdk:generate", fileParts: ["commands", "sdk", "generate.js"] }
];

const BIN_NAME = "apimatic"; // matches package.json oclif.bin

describe("all command examples parse", () => {
  COMMANDS.forEach(({ id, fileParts, exportName }) => {
    const filePath = path.join(process.cwd(), "lib", ...fileParts);
    const fileUrl = pathToFileURL(filePath).href;

    describe(id, () => {
      let examples: string[] = [];
      let ctor: any;

      before(async () => {
        const mod = await import(fileUrl);
        ctor = exportName ? mod[exportName] : mod.default;
        examples = Array.isArray(ctor?.examples) ? ctor.examples : [];
      });

      it("has examples", () => {
        expect(examples, `Command ${id} has no examples`).to.be.an("array");
      });
      
      describe("parse examples", function () {
        before(async function () {
          if (!ctor) {
            const mod = await import(fileUrl);
            ctor = exportName ? mod[exportName] : mod.default;
            examples = Array.isArray(ctor?.examples) ? ctor.examples : [];
          }
        });
        it("are valid", async function () {
          for (const example of examples) {
            const argv = toArgv(example, BIN_NAME);
            const argvForParser = argv[0] === id ? argv.slice(1) : argv;
            try {
              await Parser.parse(argvForParser, {
                flags: (ctor?.flags ?? {}) as never,
                args: (ctor?.args ?? {}) as never,
                strict: true
              } as never);
            } catch (err) {
              expect.fail(
                `Failed to parse example.\n` +
                `Command: ${id}\n` +
                `Example: ${example}\n` +
                `Error: ${(err as Error).message}`
              );
            }
          }
        });
      });
    });
  });
});

function toArgv(example: string, binName: string): string[] {
  const trimmed = example.trim();
  const withoutBin = trimmed.startsWith(`${binName} `)
    ? trimmed.slice(binName.length + 1)
    : trimmed;
  return stringArgv(withoutBin);
}
