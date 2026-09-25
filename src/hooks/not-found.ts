// This code was originally forked from https://github.com/oclif/plugin-not-found/blob/main/src/index.ts
import { Hook, toConfiguredId } from "@oclif/core";
import { cyan, yellow } from "ansis";

import utils from "./utils.js";

// The hook re-enters through `config.runCommand`, so a suggestion that fails to resolve
// would prompt forever. Allow a single retry per process, then report the failure.
let retrying = false;

const hook: Hook.CommandNotFound = async function (opts) {
  const hiddenCommandIds = new Set(opts.config.commands.filter((c) => c.hidden).map((c) => c.id));

  const commandIDs = [...opts.config.commandIDs, ...opts.config.commands.flatMap((c) => c.aliases)].filter(
    (c) => !hiddenCommandIds.has(c)
  );

  if (commandIDs.length === 0) return;

  let binHelp = `${opts.config.bin} help`;
  const idSplit = opts.id.split(":");
  // `findTopic` also matches leaf commands, so `help` reports as a topic and yields the
  // dead-end hint `apimatic help help`. Only a topic that is not itself runnable narrows it.
  if (opts.config.findTopic(idSplit[0]) && !opts.config.findCommand(idSplit[0])) {
    binHelp = `${binHelp} ${idSplit[0]}`;
  }

  const suggestion = utils.closest(opts.id, commandIDs);
  const readableSuggestion = suggestion ? toConfiguredId(suggestion, opts.config) : null;

  const originalCmd = toConfiguredId(opts.id, opts.config);
  this.warn(`${yellow(originalCmd)} is not an ${opts.config.bin} command.`);

  // A suggestion that does not resolve is worse than none: accepting it only re-enters this hook.
  const runnable = Boolean(suggestion) && Boolean(opts.config.findCommand(suggestion!));

  if (!process.stdin.isTTY || !runnable || retrying) {
    this.error(`Run ${cyan.bold(binHelp)} for a list of available commands.`, {
      exit: 127
    });
  }

  let response: boolean;
  try {
    response = await utils.getConfirmation(readableSuggestion!);
  } catch {
    response = false;
  }

  if (response) {
    retrying = true;
    try {
      return await opts.config.runCommand(suggestion!, opts.argv ?? []);
    } finally {
      retrying = false;
    }
  }

  this.error(`Run ${cyan.bold(binHelp)} for a list of available commands.`, {
    exit: 127
  });
};

export default hook;
