import { expect } from 'chai';
import { FileName } from '../../../src/types/file/fileName';

describe('FileName', () => {
  describe('normalize', () => {
    it('makes a URL segment of a file name, without its extension', () => {
      expect(new FileName('My API.v2.json').normalize().toString()).to.equal('my-api-v2');
    });
  });

  describe('slugified', () => {
    // A folder named `orders.v2` has no extension to lose, and would otherwise share a slug with `orders.v1`.
    it('makes a URL segment of the whole name, dots included', () => {
      expect(new FileName('orders.v2').slugified().toString()).to.equal('orders-v2');
      expect(new FileName(' Seller  Orders ').slugified().toString()).to.equal('seller-orders');
    });
  });

  describe('isEqual', () => {
    it('is the same name only when spelt the same, case included', () => {
      expect(new FileName('APIMATIC-META.json').isEqual(new FileName('APIMATIC-META.json'))).to.be.true;
      expect(new FileName('apimatic-meta.json').isEqual(new FileName('APIMATIC-META.json'))).to.be.false;
    });
  });
});
