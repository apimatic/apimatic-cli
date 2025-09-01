import * as path from "path";
import { Buffer } from "buffer";
import stripTags from "striptags";
import colors from "picocolors";

export const replaceHTML = (string: string) => {
  return stripTags(string);
};

export const getFileNameFromPath = (filePath: string) => {
  return path.basename(filePath).split(".")[0];
};

export async function parseStreamBodyToJson(body: NodeJS.ReadableStream): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf-8");
  return JSON.parse(text);
}

export const getMessageInOrangeColor = (message: string) => {
  return colors.yellow(message);
};

export const getMessageInBlueColor = (message: string) => {
  return colors.blueBright(message);
};

export const getMessageInCyanColor = (message: string) => {
  return colors.cyan(message);
};

export const getMessageInGreenColor = (message: string) => {
  return colors.greenBright(message);
};

export const getMessageInMagentaColor = (message: string) => {
  return colors.magentaBright(message);
};

export const getMessageInRedColor = (message: string) => {
  return colors.redBright(message);
};
