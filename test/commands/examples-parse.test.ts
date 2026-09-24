import { expect } from 'chai';
import { Parser } from '@oclif/core';
import * as path from 'path';
import { pathToFileURL } from 'node:url';
import stringArgv from 'string-argv';

type CommandMapping = {
  id: string;
  fileParts: string[]; // relative to lib/
  exportName?: string; // default export if omitted
};

const COMMANDS: CommandMapping[] = [
  { id: 'api transform', fileParts: ['commands', 'api', 'transform.js'] },
  { id: 'api validate', fileParts: ['commands', 'api', 'validate.js'] },
  { id: 'auth login', fileParts: ['commands', 'auth', 'login.js'] },
  { id: 'auth logout', fileParts: ['commands', 'auth', 'logout.js'] },
  { id: 'auth status', fileParts: ['commands', 'auth', 'status.js'] },
  { id: 'plugin generate', fileParts: ['commands', 'plugin', 'generate.js'] },
  { id: 'plugin publish', fileParts: ['commands', 'plugin', 'publish.js'] },
  { id: 'portal generate', fileParts: ['commands', 'portal', 'generate.js'] },
  { id: 'portal serve', fileParts: ['commands', 'portal', 'serve.js'] },
  { id: 'publishing profile list', fileParts: ['commands', 'publishing', 'profile', 'list.js'] },
  { id: 'quickstart', fileParts: ['commands', 'quickstart.js'] },
  { id: 'sdk generate', fileParts: ['commands', 'sdk', 'generate.js'] },
  { id: 'sdk publish', fileParts: ['commands', 'sdk', 'publish.js'] }
];

const BIN_NAME = 'apimatic'; // matches package.json oclif.bin

describe('all command examples parse', () => {
  COMMANDS.forEach(({ id, fileParts, exportName }) => {
    const filePath = path.join(process.cwd(), 'lib', ...fileParts);
    const fileUrl = pathToFileURL(filePath).href;

    describe(id, () => {
      let examples: string[] = [];
      let ctor: any;

      before(async () => {
        const mod = await import(fileUrl);
        ctor = exportName ? mod[exportName] : mod.default;
        examples = Array.isArray(ctor?.examples) ? ctor.examples : [];
      });

      it('has examples', () => {
        // Not merely an array: an unresolved export yields an empty one, which would let
        // the parse check below pass while testing nothing at all.
        expect(examples, `Command ${id} has no examples`).to.be.an('array').that.is.not.empty;
      });

      describe('parse examples', function () {
        before(async function () {
          if (!ctor) {
            const mod = await import(fileUrl);
            ctor = exportName ? mod[exportName] : mod.default;
            examples = Array.isArray(ctor?.examples) ? ctor.examples : [];
          }
        });
        it('are valid', async function () {
          const idParts = id.split(' ');
          for (const example of examples) {
            const argv = toArgv(example, BIN_NAME);
            // Examples are written as `apimatic <command id> <flags>`; toArgv()
            // strips the bin name, so strip the (possibly multi-word) command id
            // too, leaving only the flags/args for the command's own parser.
            const hasIdPrefix = idParts.every((part, i) => argv[i] === part);
            const argvForParser = hasIdPrefix ? argv.slice(idParts.length) : argv;
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
  // Examples are ANSI-colorized for `--help` output (via cmdTxt/format.flag),
  // so strip escape codes (ESC = char 27) before tokenizing.
  const ansi = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');
  const trimmed = example.replace(ansi, '').trim();
  const withoutBin = trimmed.startsWith(`${binName} `) ? trimmed.slice(binName.length + 1) : trimmed;
  return stringArgv(withoutBin);
}
