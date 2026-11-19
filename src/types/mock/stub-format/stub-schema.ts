import { Ajv2020, ValidateFunction } from 'ajv/dist/2020.js';
import { err, ok, Result } from 'neverthrow';
import { wholeNumberText } from '../json/json-number.js';
import { pointerSegment } from '../json/json-pointer.js';
import { JsonValue } from '../json/json-value.js';
import { isAllDigits } from '../text/characters.js';
import { StubProblem } from './stub-problem.js';

type Schema = Readonly<Record<string, unknown>>;

/** Where a schema rule is broken and what it says, as a person fixing the file wants to read it. */
interface Fault {
  readonly location: string;
  readonly keyword: string;
  readonly message: string;
}

const ANNOTATIONS = ['$schema', '$id', '$defs', 'title', 'description', 'default'];
const ASSERTIONS = [
  '$ref',
  'type',
  'required',
  'properties',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'minItems',
  'minProperties',
  'oneOf',
  'anyOf',
  'not',
  'if',
  'then',
  'else'
];
const KIND_RULE =
  "A stub of kind 'oauth2' has only 'oauth2'; any other kind has 'request' and 'response' and no 'oauth2'.";
const SHOWN_VALUE_LENGTH = 40;

/**
 * The JSON Schema every stub file must satisfy. ajv decides whether a file is valid; what is wrong
 * and where is read off the same schema here, because ajv lists the complaints of every branch of
 * a choice side by side and a stub author needs the one branch they meant.
 */
export class StubSchema {
  private readonly document: Schema;
  private readonly validate: ValidateFunction;

  private constructor(document: Schema, validate: ValidateFunction) {
    this.document = document;
    this.validate = validate;
  }

  /** Refuses a schema that uses a keyword this class cannot explain, so a new rule is never checked without a message. */
  public static read(document: unknown): Result<StubSchema, string> {
    if (!isSchema(document)) {
      return err('The stub schema is not a JSON object.');
    }
    const unexplained = subschemasOf(document)
      .flatMap((schema) => Object.keys(schema))
      .filter((keyword) => !ANNOTATIONS.includes(keyword) && !ASSERTIONS.includes(keyword));
    if (unexplained.length > 0) {
      return err(
        `The stub schema uses ${quotedList([...new Set(unexplained)], 'and')}, which the loader cannot explain.`
      );
    }
    try {
      // strictRequired alone is off: the kind rule names 'request' and 'oauth2' under a 'not', where no 'properties' describes them.
      return ok(new StubSchema(document, new Ajv2020({ strict: true, strictRequired: false }).compile(document)));
    } catch (error) {
      return err(`The stub schema does not compile: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** The shape problems of one file, one per location. */
  public problems(root: JsonValue, file: string): StubProblem[] {
    if (this.validate(plain(root)) === true) {
      return [];
    }
    const explained = faultsOf(this.document, this.document, root, '');
    const faults = explained.length > 0 ? explained : unexplainedFaults(this.validate);
    const locations = [...new Set(faults.map((fault) => fault.location))];
    return locations.map((location) => {
      const messages = faults.filter((fault) => fault.location === location).map((fault) => fault.message);
      const stub = stubNameAt(root, location);
      return {
        file,
        ...(stub === undefined ? {} : { stub }),
        path: location,
        message: [...new Set(messages)].join('; ')
      };
    });
  }
}

/**
 * Every broken rule under one value. A value of the wrong JSON type reports its type alone, since
 * the node's other rules describe the value it is not; a failed choice reports its closest branch
 * rather than every branch's complaint.
 */
function faultsOf(root: Schema, schema: Schema, value: JsonValue, location: string): Fault[] {
  const referenced =
    typeof schema.$ref === 'string' ? faultsOf(root, resolved(root, schema.$ref), value, location) : [];
  const allowed = schema.type === undefined ? [] : [schema.type].flat().map(String);
  if (allowed.length > 0 && !typesOf(value).some((type) => allowed.includes(type))) {
    const found = value.kind === 'number' ? `the number ${shown(value.text)}` : withArticle(value.kind);
    const message = `Expected ${quotedTypes(allowed)}, found ${found}.`;
    return [...referenced, { location, keyword: 'type', message }];
  }
  return [
    ...referenced,
    ...choiceFaults(root, schema, value, location),
    ...ownFaults(schema, value).map((fault) => ({ location, ...fault })),
    ...(isSchema(schema.not) && faultsOf(root, schema.not, value, location).length === 0
      ? [{ location, keyword: 'not', message: KIND_RULE }]
      : []),
    ...memberFaults(root, schema, value, location),
    ...conditionFaults(root, schema, value, location)
  ];
}

function choiceFaults(root: Schema, schema: Schema, value: JsonValue, location: string): Fault[] {
  return ['oneOf', 'anyOf'].flatMap((keyword) => {
    const branches = schemasIn(schema[keyword]);
    const results = branches.map((branch) => faultsOf(root, branch, value, location));
    const passing = branches.filter((_, index) => results[index].length === 0);
    if (passing.length === 1 || branches.length === 0 || (keyword === 'anyOf' && passing.length > 0)) {
      return [];
    }
    const named = branches.map(soleRequirement);
    if (named.every((name) => name !== undefined)) {
      const given = passing.map(soleRequirement);
      const message =
        passing.length === 0
          ? `Give one of ${quotedList(named, 'or')}.`
          : `Give only one of ${quotedList(named, 'and')}; this has ${quotedList(given, 'and')}.`;
      return [{ location, keyword, message }];
    }
    if (passing.length > 1) {
      return [{ location, keyword, message: `Matches ${passing.length} of the alternatives where one is allowed.` }];
    }
    return closest(results, location);
  });
}

/**
 * A branch whose every fault says the value itself has the wrong JSON type comes last: the string
 * and null branches of a value fail that way with one fault, and would otherwise win against a
 * branch with one real mistake. Then the fewest faults, then the branch whose faults point deepest.
 */
function closest(branches: Fault[][], location: string): Fault[] {
  const rank = (faults: Fault[]) => [
    faults.every((fault) => fault.keyword === 'type' && fault.location === location) ? 1 : 0,
    faults.length,
    -Math.max(0, ...faults.map((fault) => fault.location.length))
  ];
  const closer = (first: Fault[], second: Fault[]) => {
    const [one, other] = [rank(first), rank(second)];
    const differing = one.findIndex((part, index) => part !== other[index]);
    return differing >= 0 && other[differing] < one[differing] ? second : first;
  };
  const [first, ...others] = branches;
  return others.reduce((best, next) => closer(best, next), first);
}

function ownFaults(schema: Schema, value: JsonValue): { keyword: string; message: string }[] {
  const faults: { keyword: string; message: string }[] = [];
  const fault = (keyword: string, message: string) => faults.push({ keyword, message });
  const limit = (keyword: string) => (typeof schema[keyword] === 'number' ? (schema[keyword] as number) : undefined);

  if (value.kind === 'object') {
    const missing = strings(schema.required).filter((name) => !value.members.has(name));
    if (missing.length > 0) {
      fault('required', `${quotedList(missing, 'and')} ${missing.length === 1 ? 'is' : 'are'} required here.`);
    }
    if (value.members.size < (limit('minProperties') ?? 0)) {
      fault('minProperties', atLeast(limit('minProperties'), 'members'));
    }
  }
  if (value.kind === 'array' && value.items.length < (limit('minItems') ?? 0)) {
    fault('minItems', atLeast(limit('minItems'), 'items'));
  }
  if (value.kind === 'string') {
    const length = Array.from(value.value).length;
    if (length < (limit('minLength') ?? 0)) {
      fault(
        'minLength',
        limit('minLength') === 1 ? 'Must not be empty.' : `Must be at least ${limit('minLength')} characters long.`
      );
    }
    if (length > (limit('maxLength') ?? Infinity)) {
      fault('maxLength', `Must be at most ${limit('maxLength')} characters long.`);
    }
  }
  if (value.kind === 'number') {
    if (Number(value.text) < (limit('minimum') ?? -Infinity)) {
      fault('minimum', `Must be at least ${limit('minimum')}, not ${shown(value.text)}.`);
    }
    if (Number(value.text) > (limit('maximum') ?? Infinity)) {
      fault('maximum', `Must be at most ${limit('maximum')}, not ${shown(value.text)}.`);
    }
  }
  const choices = schema.const === undefined ? schema.enum : [schema.const];
  if (Array.isArray(choices) && !choices.includes(plain(value))) {
    fault(
      schema.const === undefined ? 'enum' : 'const',
      `Must be ${choices.length === 1 ? '' : 'one of '}${plainList(choices)}.`
    );
  }
  return faults;
}

function memberFaults(root: Schema, schema: Schema, value: JsonValue, location: string): Fault[] {
  if (value.kind === 'array') {
    const items = schema.items;
    return isSchema(items)
      ? value.items.flatMap((item, index) => faultsOf(root, items, item, `${location}/${index}`))
      : [];
  }
  if (value.kind !== 'object') {
    return [];
  }
  const properties = isSchema(schema.properties) ? schema.properties : {};
  const others = schema.additionalProperties;
  return [...value.members].flatMap(([name, member]) => {
    const at = `${location}/${pointerSegment(name)}`;
    const described = Object.hasOwn(properties, name) ? properties[name] : others;
    if (isSchema(described)) {
      return faultsOf(root, described, member, at);
    }
    return described === false
      ? [{ location: at, keyword: 'additionalProperties', message: `'${name}' is not a known property here.` }]
      : [];
  });
}

function conditionFaults(root: Schema, schema: Schema, value: JsonValue, location: string): Fault[] {
  if (!isSchema(schema.if)) {
    return [];
  }
  const chosen = faultsOf(root, schema.if, value, location).length === 0 ? schema.then : schema.else;
  return isSchema(chosen) ? faultsOf(root, chosen, value, location) : [];
}

/** What ajv reports, for a file it refuses and the walk above finds nothing wrong with: said in its words rather than not at all. */
function unexplainedFaults(validate: ValidateFunction): Fault[] {
  return (validate.errors ?? []).map((error) => ({
    location: error.instancePath,
    keyword: error.keyword,
    message: `${error.message ?? error.keyword}.`
  }));
}

/** The name of the stub a pointer points into, when the file is an array and the stub has one. */
function stubNameAt(root: JsonValue, location: string): string | undefined {
  const index = location.split('/')[1] ?? '';
  const stub = root.kind === 'array' && isAllDigits(index) ? root.items[Number(index)] : undefined;
  const name = stub?.kind === 'object' ? stub.members.get('name') : undefined;
  return name?.kind === 'string' ? name.value : undefined;
}

function resolved(root: Schema, reference: string): Schema {
  const target = reference
    .split('/')
    .slice(1)
    .reduce<unknown>((node, segment) => (isSchema(node) ? node[segment] : undefined), root);
  if (!reference.startsWith('#/') || !isSchema(target)) {
    throw new Error(`The stub schema refers to ${reference}, which it does not define.`);
  }
  return target;
}

/** The schema and every schema inside it, which is where a keyword is a keyword and not a property's name. */
function subschemasOf(schema: Schema): Schema[] {
  const inside = [
    ...['$defs', 'properties'].flatMap((keyword) => (isSchema(schema[keyword]) ? Object.values(schema[keyword]) : [])),
    ...['additionalProperties', 'items', 'not', 'if', 'then', 'else'].map((keyword) => schema[keyword]),
    ...['oneOf', 'anyOf'].flatMap((keyword) => schemasIn(schema[keyword]))
  ];
  return [schema, ...inside.filter(isSchema).flatMap(subschemasOf)];
}

function isSchema(value: unknown): value is Schema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const schemasIn = (value: unknown): Schema[] => (Array.isArray(value) ? value.filter(isSchema) : []);

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/** The one property a branch asks for, when asking for it is all the branch does: a choice among such branches is a choice among names. */
function soleRequirement(branch: Schema): string | undefined {
  const [name, ...more] = strings(branch.required);
  return Object.keys(branch).length === 1 && more.length === 0 ? name : undefined;
}

/** The JSON Schema types a value has; a whole number is an integer however it is written. */
function typesOf(value: JsonValue): string[] {
  return value.kind === 'number' && wholeNumberText(value.text) !== undefined ? ['integer', 'number'] : [value.kind];
}

/** The value as ajv and `enum` read it; a number loses its spelling here, which no rule of the schema looks at. */
function plain(value: JsonValue): unknown {
  switch (value.kind) {
    case 'null':
      return null;
    case 'boolean':
    case 'string':
      return value.value;
    case 'number':
      return Number(value.text);
    case 'array':
      return value.items.map(plain);
    case 'object':
      return Object.fromEntries([...value.members].map(([name, member]) => [name, plain(member)]));
  }
}

function withArticle(type: string): string {
  const word = type === 'integer' ? 'whole number' : type;
  return word === 'null' ? word : `${'aeiou'.includes(word[0]) ? 'an' : 'a'} ${word}`;
}

const quotedTypes = (types: string[]): string => listed(types.map(withArticle), 'or');

const quotedList = (names: (string | undefined)[], joiner: string): string =>
  listed(
    names.map((name) => `'${name}'`),
    joiner
  );

const plainList = (values: unknown[]): string => listed(values.map(String), 'or');

const atLeast = (count: number | undefined, things: string): string =>
  count === 1 ? 'Must not be empty.' : `Must have at least ${count} ${things}.`;

function listed(items: string[], joiner: string): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} ${joiner} ${items[items.length - 1]}`;
}

const shown = (text: string): string =>
  text.length > SHOWN_VALUE_LENGTH ? `${text.slice(0, SHOWN_VALUE_LENGTH)}...` : text;
