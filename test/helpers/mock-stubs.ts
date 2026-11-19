import { Buffer } from 'node:buffer';
import fs from 'fs';
import path from 'path';
import { ok } from 'neverthrow';
import { JsonValue } from '../../src/types/mock/json/json-value.js';
import { NamedRule } from '../../src/types/mock/stub-format/body-expectation.js';
import { loadStubs, StubFile } from '../../src/types/mock/stub-format/stub-loader.js';
import { StubProblem } from '../../src/types/mock/stub-format/stub-problem.js';
import { StubSchema } from '../../src/types/mock/stub-format/stub-schema.js';
import { ErrorStub, OAuth2Stub, StubSet, SuccessStub } from '../../src/types/mock/stub-format/stub.js';
import { ValueRule } from '../../src/types/mock/stub-format/value-rule.js';

export const stubFixtures = path.join(process.cwd(), 'test', 'resources', 'mock');

export const stubSchema = StubSchema.read(
  JSON.parse(fs.readFileSync(path.join(process.cwd(), 'mock-stubs.schema.json'), 'utf8'))
)._unsafeUnwrap();

/** A stubs directory held in memory: each file's text, or its bytes when the encoding is what a test is about. */
export type StubFiles = Record<string, string | Uint8Array>;

export function loadFiles(files: StubFiles) {
  const read: StubFile[] = Object.entries(files).map(([name, content]) => ({
    name,
    content: ok(typeof content === 'string' ? Buffer.from(content, 'utf8') : content)
  }));
  return loadStubs(read, stubSchema);
}

export const stubsOf = (files: StubFiles): StubSet => loadFiles(files)._unsafeUnwrap();

export const problemsOf = (files: StubFiles): StubProblem[] => loadFiles(files)._unsafeUnwrapErr();

/** One of the reference's stub sets under test/resources/mock, loaded through the pure loader. */
export function fixtureStubs(set: string): StubSet {
  const directory = path.join(stubFixtures, set);
  const files = fs.readdirSync(directory).map((name) => [name, fs.readFileSync(path.join(directory, name))]);
  return stubsOf(Object.fromEntries(files));
}

let samples: StubSet | undefined;

export function sampleStubs(): StubSet {
  samples ??= fixtureStubs('sample');
  return samples;
}

export function sampleSuccess(name: string): SuccessStub {
  const stub = sampleStubs().endpoints.find((each) => each.name === name);
  if (stub?.kind !== 'success') {
    throw new Error(`The sample set has no success stub named '${name}'.`);
  }
  return stub;
}

export function sampleError(name: string): ErrorStub {
  const stub = sampleStubs().endpoints.find((each) => each.name === name);
  if (stub?.kind !== 'error') {
    throw new Error(`The sample set has no error stub named '${name}'.`);
  }
  return stub;
}

export function sampleOAuth2(name: string): OAuth2Stub {
  const stub = sampleStubs().oauth2Servers.find((each) => each.name === name);
  if (stub === undefined) {
    throw new Error(`The sample set has no oauth2 stub named '${name}'.`);
  }
  return stub;
}

export function ruleNamed(rules: readonly NamedRule[], name: string): ValueRule {
  const found = rules.find((rule) => rule.name === name);
  if (found === undefined) {
    throw new Error(`No rule is named '${name}' among ${rules.map((rule) => rule.name).join(', ')}.`);
  }
  return found.rule;
}

export function memberOf(json: JsonValue, name: string): JsonValue {
  const value = json.kind === 'object' ? json.members.get(name) : undefined;
  if (value === undefined) {
    throw new Error(`The document has no member '${name}'.`);
  }
  return value;
}

const extra = (members: string | undefined): string => (members ? `, ${members}` : '');

/** Minimal stub files for tests that care about one rule at a time; each option is JSON text placed as its name says. */
export function successStub(
  options: {
    name?: string;
    extraStub?: string;
    path?: string;
    headers?: string;
    body?: string;
    extraRequest?: string;
    response?: string;
    operation?: string;
    method?: string;
  } = {}
): string {
  const {
    name = 's',
    path: route = '/v1/x',
    response = '{ "status": 200 }',
    operation = 'op',
    method = 'GET'
  } = options;
  const headers = options.headers ? `, "headers": { ${options.headers} }` : '';
  const request = `{ "method": "${method}", "path": "${route}"${headers}${extra(options.body)}${extra(
    options.extraRequest
  )} }`;
  return `[ { "name": "${name}"${extra(
    options.extraStub
  )}, "operation": "${operation}", "request": ${request}, "response": ${response} } ]`;
}

export function errorStub(
  options: {
    name?: string;
    extraStub?: string;
    status?: number;
    extraRequest?: string;
    extraResponse?: string;
    operation?: string;
    method?: string;
    path?: string;
  } = {}
): string {
  const { name = 'e', status = 404, operation = 'op', method = 'GET', path: route = '/v1/{id}' } = options;
  const request = `{ "method": "${method}", "path": "${route}"${extra(options.extraRequest)} }`;
  const response = `{ "status": ${status}${extra(options.extraResponse)} }`;
  return `[ { "name": "${name}"${extra(
    options.extraStub
  )}, "operation": "${operation}", "kind": "error", "request": ${request}, "response": ${response} } ]`;
}

/** `flows` holds the members of "flows" (client credentials unless said otherwise), `settings` more members of "oauth2". */
export function oauth2Stub(
  options: { name?: string; extraStub?: string; tokenPath?: string; flows?: string; settings?: string } = {}
): string {
  const { name = 'oauth', tokenPath = '/oauth2/token', flows = '"clientCredentials": {}' } = options;
  const oauth2 = `{ "tokenPath": "${tokenPath}", "flows": { ${flows} }, "clientId": "c", "clientSecret": "s"${extra(
    options.settings
  )} }`;
  return `[ { "name": "${name}"${extra(options.extraStub)}, "kind": "oauth2", "oauth2": ${oauth2} } ]`;
}
