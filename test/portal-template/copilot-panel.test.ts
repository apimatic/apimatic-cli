import { expect } from 'chai';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import type { Availability } from '../../portal-template/src/lib/copilot-client';

const ENTRY = 'virtual:copilot-panel-fixture';
const SUGGESTION = 'How do I get started?';

// The panel inside the chat's provider, with a suggested question the chat would offer.
const fixture = `
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useChat } from '@ai-sdk/react';
import { AIChatProvider } from '@fumadocs/ai-chat';
import { CopilotPanel } from '/portal-template/src/components/copilot-panel.tsx';

function Shown({ availability }) {
  const chat = useChat({});
  return createElement(
    AIChatProvider,
    { chat, suggestions: [${JSON.stringify(SUGGESTION)}] },
    createElement(CopilotPanel, { availability })
  );
}

export function render(availability) {
  return renderToStaticMarkup(createElement(Shown, { availability }));
}
`;

function copilotPanelFixture(): Plugin {
  return {
    name: 'copilot-panel-fixture',
    enforce: 'pre',
    resolveId: (id) => (id === ENTRY ? `\0${ENTRY}` : null),
    load: (id) => (id === `\0${ENTRY}` ? fixture : null)
  };
}

describe('the Ask AI panel', function () {
  this.timeout(60 * 1000);

  let server: ViteDevServer;
  let render: (availability: Availability) => string;

  before(async () => {
    server = await createServer({
      configFile: false,
      root: process.cwd(),
      resolve: { tsconfigPaths: true },
      logLevel: 'silent',
      appType: 'custom',
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [copilotPanelFixture()]
    });
    ({ render } = (await server.ssrLoadModule(ENTRY)) as { render: typeof render });
  });

  after(() => server.close());

  it('offers no question until the service has answered', () => {
    const markup = render('checking');

    expect(markup).to.contain('Starting Ask AI');
    expect(markup).to.not.contain(SUGGESTION);
    expect(markup).to.not.contain('<textarea');
  });

  it('offers the suggested questions and the input once the service has let the portal in', () => {
    const markup = render('available');

    expect(markup).to.contain(SUGGESTION);
    expect(markup).to.contain('<textarea');
  });

  it("explains a lapsed plan, linking to the upgrade in a new tab that can't reach the portal", () => {
    const markup = render({
      message: "Ask AI is unavailable because this portal's APIMatic trial has ended.",
      upgradeUrl: 'https://www.apimatic.io/pricing'
    });

    expect(markup).to.contain('trial has ended');
    expect(markup).to.not.contain(SUGGESTION);
    const link = /<a ([^>]*)>Upgrade<\/a>/.exec(markup);
    expect(link, 'the Upgrade link').to.not.be.null;
    expect(link![1]).to.contain('href="https://www.apimatic.io/pricing"');
    expect(link![1]).to.contain('target="_blank"');
    expect(link![1]).to.contain('rel="noopener noreferrer"');
  });
});
