import { expect } from 'chai';
import { searchOutcome, type SearchDialogState } from '../../portal-template/src/lib/search-report';

describe('searchOutcome', () => {
  const closed: SearchDialogState = {
    open: false,
    loading: false,
    typed: true,
    picked: '',
    term: 'pets',
    resultCount: 3
  };

  it('waits while the dialog is open, and while the last keystrokes’ results load after it closed', () => {
    expect(searchOutcome({ ...closed, open: true })).to.deep.equal({ ended: false });
    expect(searchOutcome({ ...closed, loading: true })).to.deep.equal({ ended: false });
  });

  it('reports a typed term with the count shown once the results are in', () => {
    expect(searchOutcome(closed)).to.deep.equal({
      ended: true,
      report: { search_term: 'pets', result: '', result_count: 3 }
    });
  });

  // Fumadocs hands over the pick before the close renders, so a pick made with the hotkey's term counts too.
  it('reports the result picked, typed or not', () => {
    const picked = 'https://docs.acme.com/api/pets/listPets';

    expect(searchOutcome({ ...closed, typed: false, picked })).to.deep.equal({
      ended: true,
      report: { search_term: 'pets', result: picked, result_count: 3 }
    });
  });

  // Every event's page_location has this shape, so a report can join a search to the page it led to.
  it('reports the result as a whole address, without the # part of a heading hit', () => {
    const picked = 'https://docs.acme.com/docs/guides/intro#install';

    expect(searchOutcome({ ...closed, picked })).to.have.nested.property(
      'report.result',
      'https://docs.acme.com/docs/guides/intro'
    );
  });

  it('ends without a report when the reader neither typed nor picked, or left no term', () => {
    expect(searchOutcome({ ...closed, typed: false })).to.deep.equal({ ended: true, report: null });
    expect(searchOutcome({ ...closed, term: '  ' })).to.deep.equal({ ended: true, report: null });
  });

  it('reports the term without the spaces around it', () => {
    expect(searchOutcome({ ...closed, term: '  list pets ' })).to.have.nested.property(
      'report.search_term',
      'list pets'
    );
  });

  it('reports at most the 100 characters of a term that GA4 keeps', () => {
    expect(searchOutcome({ ...closed, term: 'k'.repeat(300) })).to.have.nested.property(
      'report.search_term',
      'k'.repeat(100)
    );
  });
});
