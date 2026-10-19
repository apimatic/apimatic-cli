import fs from 'node:fs';
import { expect } from 'chai';
import { refuseFailedRenders } from '../../portal-template/failed-renders';

describe('refuseFailedRenders', () => {
  const page = { path: '/components/banner' };
  const FAILED = '<main><!--$!--><template></template><!--/$--></main>';

  /** The check, watching a console of its own, and what reached that console. */
  const watching = () => {
    const written: unknown[][] = [];
    const output = { error: (...data: unknown[]) => written.push(data) };
    return { refuse: refuseFailedRenders(output), output, written };
  };

  // As React wrote them into a page whose MDX named a component the portal does not provide.
  for (const [when, html] of [
    ['before the page was sent', FAILED],
    [
      'after the page was sent',
      '<main><!--$?--><template id="B:0"></template><!--/$--></main><script>$RX("B:0","")</script>'
    ]
  ]) {
    it(`fails a page whose content threw ${when}, naming it`, () => {
      expect(() => watching().refuse({ page, html })).to.throw(/^\/components\/banner failed to render/);
    });
  }

  it('passes a page that rendered in full, and one whose text mentions the markers', () => {
    const html = '<main><!--$--><p>Write &lt;!--$!--&gt; or $RX(&quot;B:0&quot;) in a code sample.</p><!--/$--></main>';

    expect(() => watching().refuse({ page, html })).to.not.throw();
  });

  // The build log's tail, all the CLI shows, can leave the error out.
  it('quotes the error the server reported while rendering, and still writes it out', () => {
    const { refuse, output, written } = watching();
    const error = new Error('Expected component `Banner` to be defined: you likely forgot to import it.\nMore.');

    output.error('Error in renderToReadableStream:', error, {});
    output.error('Something else went wrong:', new Error('Not a render.'));

    expect(() => refuse({ page, html: FAILED })).to.throw(
      /an error in its place\. The server reported: Expected component `Banner` to be defined: you likely forgot to import it\.$/
    );
    expect(written).to.have.length(2);
  });

  it('points to the build log when the server reported nothing', () => {
    expect(() => watching().refuse({ page, html: FAILED })).to.throw(/Its error is in the build log\.$/);
  });

  // The markers are React's own, read from 19.2's output: another React has to be read again.
  it('reads the markers of the React the portal is built with', () => {
    const { dependencies } = JSON.parse(fs.readFileSync('package.json', 'utf8'));

    expect(dependencies['react-dom']).to.match(/^19\.2\./);
  });
});
