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
  if (!str) return '';
  let current = '';
  let nextToUpper = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (char >= 'a' && char <= 'z') {
      if (nextToUpper) {
        current += ' ' + char.toUpperCase();
        nextToUpper = false;
      } else {
        current += char;
      }
    } else {
      if (char >= 'A' && char <= 'Z') {
        current += ' ' + char.toUpperCase();
      } else if (char >= '0' && char <= '9') {
        current += ' ' + char;
        nextToUpper = true;
      } else {
        nextToUpper = true;
      }
    }
  }

  current = current.charAt(0).toUpperCase() + current.slice(1);
  return current.trim();
}

export function getUniqueGroupName(baseName: string, existingGroups: Map<string, unknown>): string {
  let counter = 1;
  let name = baseName;

  while (existingGroups.has(toTitleCase(name))) {
    name = `${baseName}${counter}`;
    counter++;
  }

  return name;
}