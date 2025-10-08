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

export function toTitleCase(str: string): string {
  if (str === '') return '';

  let current = '';
  let shouldCapitalizeNext = false;

  for (const char of str) {
    if (isLowercase(char)) {
      if (shouldCapitalizeNext) {
        current += ' ' + char.toUpperCase();
        shouldCapitalizeNext = false;
      } else {
        current += char;
      }
    } else if (isUppercase(char)) {
      current += ' ' + char;
    } else if (isDigit(char)) {
      current += ' ' + char;
      shouldCapitalizeNext = true;
    } else {
      shouldCapitalizeNext = true;
    }
  }

  current = current.charAt(0).toUpperCase() + current.slice(1);
  return current.trimStart();
}

function isLowercase(char: string): boolean {
  return char >= 'a' && char <= 'z';
}

function isUppercase(char: string): boolean {
  return char >= 'A' && char <= 'Z';
}

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}