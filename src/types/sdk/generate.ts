import { Platforms } from "@apimatic/sdk";

export enum Language {
  CSHARP = "csharp",
  JAVA = "java",
  PHP = "php",
  PYTHON = "python",
  RUBY = "ruby",
  TYPESCRIPT = "typescript",
  GO = "go"
}

export const LANGUAGE_PLATFORM_MAP: Record<Language, Platforms> = {
  [Language.CSHARP]: Platforms.CsNetStandardLib,
  [Language.JAVA]: Platforms.JavaEclipseJreLib,
  [Language.PHP]: Platforms.PhpGenericLibV2,
  [Language.PYTHON]: Platforms.PythonGenericLib,
  [Language.RUBY]: Platforms.RubyGenericLib,
  [Language.TYPESCRIPT]: Platforms.TsGenericLib,
  [Language.GO]: Platforms.GoGenericLib,
};