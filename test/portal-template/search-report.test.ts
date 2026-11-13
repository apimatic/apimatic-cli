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
    expect(searchOutcome({ ...closed, typed: false, picked: '/api/pets/listPets' })).to.deep.equal({
      ended: true,
      report: { search_term: 'pets', result: '/api/pets/listPets', result_count: 3 }
    });
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
});
