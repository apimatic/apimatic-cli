import { expect } from 'chai';
import { CopilotClient, questionMessage } from '../../portal-template/src/lib/copilot-client';

const COPILOT = { key: 'pk_live_abc', apiUrl: 'https://ask.example.com' };

interface Call {
  url: string;
  init: RequestInit;
}

/** A service that answers each call in turn, recording what it was sent. */
function service(...replies: (Response | (() => Response))[]) {
  const calls: Call[] = [];
  const send = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    const reply = replies.shift();
    if (!reply) throw new Error('no more replies');
    return typeof reply === 'function' ? reply() : reply;
  }) as typeof fetch;
  return { calls, send };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const session = (token: string, inMs = 900_000) =>
  json({ token, expiresAt: new Date(Date.now() + inMs).toISOString() });

describe('the Ask AI client', () => {
  it('opens a session with the public key, then asks with the session token only', async () => {
    const { calls, send } = service(session('t1'), new Response('stream'));
    const client = new CopilotClient(COPILOT, () => undefined, send);
    const response = await client.fetch(client.chatAddress(), { method: 'POST', body: '{}' });
    expect(await response.text()).to.equal('stream');
    expect(calls[0]!.url).to.equal('https://ask.example.com/v1/sessions');
    expect(JSON.parse(calls[0]!.init.body as string)).to.deep.equal({ key: 'pk_live_abc' });
    expect(calls[1]!.url).to.equal('https://ask.example.com/v1/chat');
    expect(new Headers(calls[1]!.init.headers).get('authorization')).to.equal('Bearer t1');
    expect(calls[1]!.init.credentials).to.equal('omit');
    expect(calls[1]!.init.body).to.not.contain('pk_live_abc');
  });

  it('reuses a session, and renews one that has expired', async () => {
    const { calls, send } = service(session('t1'), new Response('a'), new Response('b'));
    const client = new CopilotClient(COPILOT, () => undefined, send);
    await client.fetch(client.chatAddress(), {});
    await client.fetch(client.chatAddress(), {});
    expect(calls.map((call) => call.url.split('/v1/')[1])).to.deep.equal(['sessions', 'chat', 'chat']);

    const renewing = service(session('old', 10_000), new Response('a'), session('new'), new Response('b'));
    const renewed = new CopilotClient(COPILOT, () => undefined, renewing.send);
    await renewed.fetch(renewed.chatAddress(), {});
    await renewed.fetch(renewed.chatAddress(), {});
    expect(new Headers(renewing.calls[3]!.init.headers).get('authorization')).to.equal('Bearer new');
  });

  it('opens a new session once when the service says the token expired', async () => {
    const { calls, send } = service(
      session('t1'),
      json({ code: 'session_expired', message: 'expired' }, 401),
      session('t2'),
      new Response('ok')
    );
    const client = new CopilotClient(COPILOT, () => undefined, send);
    expect(await (await client.fetch(client.chatAddress(), {})).text()).to.equal('ok');
    expect(new Headers(calls[3]!.init.headers).get('authorization')).to.equal('Bearer t2');
  });

  it("shows the service's own message when it refuses a question", async () => {
    const { send } = service(
      session('t1'),
      json({ code: 'quota_exceeded', message: 'Limit reached. Search still works.' }, 429)
    );
    const client = new CopilotClient(COPILOT, () => undefined, send);
    const response = await client.fetch(client.chatAddress(), {});
    expect(response.status).to.equal(429);
    expect(await response.text()).to.equal('Limit reached. Search still works.');
  });

  it('hides Ask AI when the service turns the portal away', async () => {
    for (const code of ['copilot_disabled', 'invalid_key', 'origin_not_allowed']) {
      let hidden = false;
      const { send } = service(json({ code, message: 'no' }, 403));
      const client = new CopilotClient(COPILOT, () => (hidden = true), send);
      let failed = false;
      await client.fetch(client.chatAddress(), {}).catch(() => (failed = true));
      expect(failed, code).to.be.true;
      expect(hidden, code).to.be.true;
    }
  });

  it('opens the session ahead of the first question, which then uses it', async () => {
    const { calls, send } = service(session('t1'), new Response('ok'));
    const client = new CopilotClient(COPILOT, () => undefined, send);

    await client.prepare();
    await client.fetch(client.chatAddress(), {});

    expect(calls.map((call) => call.url.split('/v1/')[1])).to.deep.equal(['sessions', 'chat']);
    expect(new Headers(calls[1]!.init.headers).get('authorization')).to.equal('Bearer t1');
  });

  it('hides Ask AI as the session opens, before any question, when the service turns the portal away', async () => {
    let hidden = false;
    const { send } = service(json({ code: 'invalid_key', message: 'no' }, 403));
    const client = new CopilotClient(COPILOT, () => (hidden = true), send);

    await client.prepare();

    expect(hidden).to.be.true;
  });

  it('leaves any other failure to open the session to the first question, which tries again', async () => {
    const { calls, send } = service(
      () => {
        throw new TypeError('Failed to fetch');
      },
      session('t1'),
      new Response('ok')
    );
    let hidden = false;
    const client = new CopilotClient(COPILOT, () => (hidden = true), send);

    await client.prepare();

    expect(hidden).to.be.false;
    expect(await (await client.fetch(client.chatAddress(), {})).text()).to.equal('ok');
    expect(calls).to.have.length(3);
  });

  it('says the service is unavailable when it cannot be reached, and tries again next time', async () => {
    const { calls, send } = service(
      () => {
        throw new TypeError('Failed to fetch');
      },
      session('t1'),
      new Response('ok')
    );
    const client = new CopilotClient(COPILOT, () => undefined, send);
    let message = '';
    await client.fetch(client.chatAddress(), {}).catch((error: Error) => (message = error.message));
    expect(message).to.contain('unavailable');
    expect(await (await client.fetch(client.chatAddress(), {})).text()).to.equal('ok');
    expect(calls).to.have.length(3);
  });

  it('continues the thread the service started, and starts afresh with a new chat', () => {
    const client = new CopilotClient(COPILOT, () => undefined, service().send);
    expect(client.questionBody([{ id: 'q1' }], 'submit-message')).to.deep.equal({
      threadId: null,
      trigger: 'submit-message',
      message: { id: 'q1' }
    });
    client.noteData({ type: 'data-thread', data: { threadId: 'th-1' } });
    expect(client.questionBody([{ id: 'q1' }, { id: 'a1' }, { id: 'q2' }], 'submit-message').threadId).to.equal('th-1');
    expect(client.questionBody([{ id: 'q9' }], 'submit-message').threadId).to.be.null;
  });
});

describe("the Ask AI question's page", () => {
  it('names the page a question is asked from by its address, without its query or fragment', () => {
    const message = questionMessage('How do I log in?', {
      href: 'https://docs.example.com/docs/oauth/callback?code=secret&state=xyz#token=abc',
      title: 'Signing in'
    });

    expect(message).to.deep.equal({
      role: 'user',
      parts: [
        {
          type: 'data-client',
          data: { location: 'https://docs.example.com/docs/oauth/callback', title: 'Signing in' }
        },
        { type: 'text', text: 'How do I log in?' }
      ]
    });
    expect(JSON.stringify(message)).to.not.contain('secret').and.not.contain('abc');
  });
});
