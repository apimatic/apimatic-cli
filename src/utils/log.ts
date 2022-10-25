import chalk = require("chalk");

const info = (message: string): void => {
  console.log(`${chalk.bgBlue.bold.black("Info:")} ${chalk.blue(message)}`);
};
const warn = (message: string): void => {
  console.log(`${chalk.bgYellow.bold.black("Warning:")} ${chalk.yellow(message)}`);
};
const success = (message: string): void => {
  console.log(`${chalk.bgGreen.bold.black("Success:")} ${chalk.green(message)}`);
};
const errors = (message: string): void => {
  console.log(`${chalk.bgRedBright.bold.black("Error:")} ${chalk.redBright(message)}`);
};

export const log = {
  info: info,
  error: errors,
  warn: warn,
  success: success
};
