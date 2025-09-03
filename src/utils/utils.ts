import * as path from "path";
import { Buffer } from "buffer";
import stripTags from "striptags";

export const replaceHTML = (string: string) => {
  return stripTags(string);
};

export const getFileNameFromPath = (filePath: string) => {
  return path.basename(filePath).split(".")[0];
};

export async function parseStreamBodyToJson(body: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf-8");
  return JSON.parse(text);
}

export const toPascalCase = (str: string): string => {
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
};
