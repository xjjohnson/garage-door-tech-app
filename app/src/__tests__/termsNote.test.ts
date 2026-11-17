import { termsNote } from '../lib/odooSettings';

const client = (company: Record<string, unknown>, param?: unknown) =>
  ({
    session: { uid: 5, url: 'https://shop.odoo.com' },
    call: async (model: string, method: string) => {
      if (model === 'res.users') return [{ company_id: [1, 'Co'] }];
      if (model === 'res.company') return [company];
      if (model === 'ir.config_parameter') {
        if (param === undefined) throw new Error('denied');
        return param;
      }
      return [];
    },
  }) as never;

describe('termsNote', () => {
  it('links the terms page when the company uses one', async () => {
    expect(await termsNote(client({ terms_type: 'html' }, 'http://johnsons.example/'))).toBe('Terms & Conditions: http://johnsons.example/terms');
  });
  it('falls back to the sign-in address when the base url is unreadable', async () => {
    expect(await termsNote(client({ terms_type: 'html' }))).toBe('Terms & Conditions: https://shop.odoo.com/terms');
  });
  it('uses plain terms text, and nothing when there are none', async () => {
    expect(await termsNote(client({ terms_type: 'plain', invoice_terms: ' Net 7 ' }))).toBe('Net 7');
    expect(await termsNote(client({ terms_type: 'plain', invoice_terms: false }))).toBe('');
  });
});
