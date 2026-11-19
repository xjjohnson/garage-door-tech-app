import { htmlToText, readProfile, textToHtml, writeProfile } from '../lib/odooCompany';

type Call = [string, string, unknown[], Record<string, unknown>?];
function fake(row: Record<string, unknown>, fields: string[] | null = null) {
  const calls: Call[] = [];
  const client = {
    calls,
    session: { uid: 7 },
    call: async (model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>) => {
      calls.push([model, method, args, kwargs]);
      if (model === 'res.users') return [{ company_id: [3, 'Johnsons'] }];
      if (method === 'fields_get') return fields ? Object.fromEntries(fields.map((f) => [f, { type: 'char' }])) : {};
      if (method === 'read') return [row];
      return true;
    },
  };
  return client as never as Parameters<typeof readProfile>[0] & { calls: Call[] };
}

describe('business profile on the Odoo company', () => {
  it('reads Odoo values and the read-only words', async () => {
    const p = await readProfile(fake({ name: 'Johnsons', phone: '555', vat: false, state_id: [1, 'Texas'], country_id: [2, 'United States'], currency_id: [3, 'USD'], account_sale_tax_id: [4, 'Sales Tax 8%'] }));
    expect(p.values.name).toBe('Johnsons');
    expect(p.values.vat).toBe('');
    expect(p).toMatchObject({ state: 'Texas', country: 'United States', currency: 'USD', salesTax: 'Sales Tax 8%' });
  });

  it('skips fields this Odoo does not have', async () => {
    const c = fake({ name: 'J' }, ['name', 'phone']);
    const p = await readProfile(c);
    expect(p.has.phone).toBe(true);
    expect(p.has.report_footer).toBe(false);
    const asked = c.calls.find((x) => x[0] === 'res.company' && x[1] === 'read')![3]!.fields as string[];
    expect(asked).toContain('phone');
    expect(asked).not.toContain('report_footer');
  });

  it('writes only the fields given, clears blanks, and never writes anything else', async () => {
    const c = fake({});
    await writeProfile(c, { phone: ' 555-0100 ', website: '', quotation_validity_days: '30' });
    const w = c.calls.find((x) => x[1] === 'write')!;
    expect(w[0]).toBe('res.company');
    expect(w[2]).toEqual([[3], { phone: '555-0100', website: false, quotation_validity_days: 30 }]);
  });

  it('refuses an empty name or a bad number and sends nothing', async () => {
    const c = fake({});
    await expect(writeProfile(c, { name: ' ' })).rejects.toThrow();
    await expect(writeProfile(c, { quotation_validity_days: 'abc' })).rejects.toThrow();
    expect(c.calls.some((x) => x[1] === 'write')).toBe(false);
  });
});

describe('rich-text company fields', () => {
  it('shows Odoo HTML as plain text and treats empty HTML as blank', async () => {
    const p = await readProfile(fake({ name: 'J', report_header: '<h3 data-oe-version="2.0"><br></h3>', report_footer: '<p data-oe-version="2.0">Call us &amp; save<br>Lic 12</p><p>Thanks</p>' }));
    expect(p.values.report_header).toBe('');
    expect(p.values.report_footer).toBe('Call us & save\nLic 12\n\nThanks');
    expect(p.rawHtml.report_footer).toContain('<p');
  });

  it('writes plain text back as escaped Odoo HTML, and blank as empty', async () => {
    expect(textToHtml('A < B & C\nline two\n\nnext')).toBe('<p>A &lt; B &amp; C<br>line two</p><p>next</p>');
    expect(htmlToText(textToHtml('x\ny'))).toBe('x\ny');
    const c = fake({ name: 'J' });
    await writeProfile(c, { report_footer: 'Hi\nthere', report_header: '  ' });
    const w = c.calls.find((x) => x[1] === 'write')!;
    expect(w[2][1]).toEqual({ report_footer: '<p>Hi<br>there</p>', report_header: false });
  });
});
