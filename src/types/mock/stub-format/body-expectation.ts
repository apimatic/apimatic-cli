import { JsonValue } from '../json/json-value.js';
import { ValueRule } from './value-rule.js';

/** The json / text / bytes alternatives: what a whole body states, and all that a multipart part can state for itself. */
export type ContentExpectation =
  | { readonly kind: 'json'; readonly json: JsonValue }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array };

/**
 * What the request body must be. JSON is compared structurally, text by code unit and bytes one by
 * one; a form has a rule per field and no field the stub does not name; a multipart body has
 * exactly these parts, and a name sent more than once lists its parts in wire order.
 */
export type BodyExpectation =
  | { readonly kind: 'none' }
  | { readonly kind: 'any' }
  | ContentExpectation
  | { readonly kind: 'form'; readonly fields: readonly NamedRule[] }
  | { readonly kind: 'multipart'; readonly parts: readonly NamedParts[] };

/** Sorted by name wherever they are listed, so a report names differences in one order on every run. */
export interface NamedRule {
  readonly name: string;
  readonly rule: ValueRule;
}

export interface NamedParts {
  readonly name: string;
  readonly parts: readonly PartExpectation[];
}

/** One multipart part; the filename and the Content-Type are `any` when the stub does not fix them. */
export interface PartExpectation {
  readonly fileName: ValueRule;
  readonly contentType: ValueRule;
  readonly content: ContentExpectation;
}
