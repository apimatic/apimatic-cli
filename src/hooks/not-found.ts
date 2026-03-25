// This code was originally forked from https://github.com/oclif/plugin-not-found/blob/main/src/index.ts
import { Hook, toConfiguredId } from "@oclif/core";
import { cyan, yellow } from "ansis";

import utils from "./utils.js";

const hook: Hook.CommandNotFound = async function (opts) {
  const hiddenCommandIds = new Set(opts.config.commands.filter((c) => c.hidden).map((c) => c.id));

  const commandIDs = [...opts.config.commandIDs, ...opts.config.commands.flatMap((c) => c.aliases)].filter(
    (c) => !hiddenCommandIds.has(c)
  );

  if (commandIDs.length === 0) return;

  let binHelp = `${opts.config.bin} help`;
  const idSplit = opts.id.split(":");
  if (opts.config.findTopic(idSplit[0])) {
    binHelp = `${binHelp} ${idSplit[0]}`;
  }

  let suggestion: string | null;
  if (/:?help:?/.test(opts.id)) {
    suggestion = ["help", ...opts.id.split(":").filter((cmd) => cmd !== "help")].join(":");
  } else {
    suggestion = utils.closest(opts.id, commandIDs);
  }

  const readableSuggestion = suggestion ? toConfiguredId(suggestion, this.config) : null;

  const originalCmd = toConfiguredId(opts.id, this.config);
  this.warn(`${yellow(originalCmd)} is not a ${opts.config.bin} command.`);

  if (!process.stdin.isTTY || !suggestion) {
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
    const confirmedSuggestion = suggestion!;
    let argv = opts.argv ?? [];

    if (confirmedSuggestion.startsWith("help:")) {
      argv = confirmedSuggestion.split(":").slice(1);
      suggestion = "help";
    }

    return this.config.runCommand(confirmedSuggestion, argv);
  }

  this.error(`Run ${cyan.bold(binHelp)} for a list of available commands.`, {
    exit: 127
  });

};

export default hook;
