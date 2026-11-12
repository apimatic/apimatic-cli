import { Buffer } from 'node:buffer';
import { formDecode } from '../matching/query-string.js';
import { RequestModel } from '../matching/request-model.js';
import { asciiUpperCase } from '../text/ascii.js';
import { decodeBase64 } from '../text/base64.js';
import { Fields } from './fields.js';

const BASIC = 'Basic ';

/**
 * The client's id and secret as a token request presented them, as lists so the report reads a
 * missing one as absent and a second one, such as a form secret beside a Basic header, as a value
 * too many.
 */
export interface ClientAuthentication {
  readonly id: readonly string[];
  readonly secret: readonly string[];
}

/**
 * client_secret_basic (the Authorization header) or client_secret_post (the form), never both
 * (RFC 6749 section 2.3). A request carries one Authorization header at most, so two are presented
 * as the id, as a malformed one is, and every grant refuses them: read as none, they would let the
 * form's credentials through beside them.
 */
export function clientAuthenticationOf(request: RequestModel, form: Fields): ClientAuthentication {
  const headers = request.header('Authorization');
  if (headers.length === 1 && asciiUpperCase(headers[0]).startsWith(asciiUpperCase(BASIC))) {
    return fromBasic(headers[0], form);
  }
  return headers.length >= 2
    ? { id: headers, secret: [] }
    : { id: form.values('client_id'), secret: form.values('client_secret') };
}

/**
 * RFC 6749 section 2.3.1: base64 of the form-encoded id, a colon and the form-encoded secret, so
 * `+` is a space. Anything else is presented as the id, the whole header as sent: its payload alone
 * could be the client id itself (`Basic test-client-id`), which a grant that checks a secret only
 * if one is sent would accept.
 */
function fromBasic(header: string, form: Fields): ClientAuthentication {
  const decoded = decodeBase64(header.slice(BASIC.length).trim());
  const credentials = decoded === undefined ? '' : Buffer.from(decoded).toString('utf8');
  const colon = credentials.indexOf(':');
  if (decoded === undefined || colon < 0) {
    return { id: [header], secret: [] };
  }
  // The header's own id may stand in the form once, as RFC 6749 section 3.2.1 lets a client name itself.
  const id = [formDecode(credentials.slice(0, colon))];
  const formIds = form.values('client_id');
  const sameId = formIds.length === 1 && formIds[0] === id[0];
  return {
    id: sameId ? id : [...id, ...formIds],
    secret: [formDecode(credentials.slice(colon + 1)), ...form.values('client_secret')]
  };
}
