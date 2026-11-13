import { addAddress, saveAddress, splitAddresses } from '../lib/odooContacts';
import { locationFor } from '../lib/odooJobs';
import { fillRegion, otherState, regionVals } from '../lib/odooRegion';

type Call = { model: string; method: string; args: unknown[] };

/** A fake Odoo with Texas (state 52) in the US (country 233), and contacts' current state and country. */
function fake(rows: Record<number, { state_id: unknown; country_id: unknown }> = {}, withTexas = true) {
  const calls: Call[] = [];
  const c = {
    session: { kind: 'oca', fields: [] },
    call: async (model: string, method: string, args: unknown[]) => {
      calls.push({ model, method, args });
      if (model === 'res.country.state') return withTexas ? [{ id: 52, country_id: [233, 'United States'] }] : [];
      if (method === 'read') return (args[0] as number[]).map((id) => ({ id, ...(rows[id] ?? { state_id: false, country_id: false }) }));
      if (method === 'search_read') return [];
      if (method === 'create') return 900;
      return true;
    },
  };
  return { c, calls, writes: () => calls.filter((x) => x.method === 'write').map((x) => x.args) };
}

describe('Texas and United States on addresses sent to Odoo', () => {
  it('knows an address in another state', () => {
    expect(otherState('1300 Main St, Kyle, TX 78640')).toBe(false);
    expect(otherState('400 Main St, Kyle 78640')).toBe(false);
    expect(otherState('9 Elm St, Tulsa, OK 74101')).toBe(true);
    expect(otherState('9 Elm St, Ardmore, Oklahoma')).toBe(true);
  });

  it('gives a new contact Texas and the US, looking them up once', async () => {
    const o = fake();
    expect(await regionVals(o.c, '400 Main St, Kyle 78640')).toEqual({ state_id: 52, country_id: 233 });
    expect(await regionVals(o.c, '9 Elm St, Kyle')).toEqual({ state_id: 52, country_id: 233 });
    expect(await regionVals(o.c, '')).toEqual({});
    expect(await regionVals(o.c, '9 Elm St, Tulsa, OK 74101')).toEqual({});
    expect(o.calls.filter((x) => x.model === 'res.country.state')).toHaveLength(1);
    expect(await regionVals(fake({}, false).c, '400 Main St, Kyle')).toEqual({});
  });

  it('fills only an empty State or Country after a save', async () => {
    const o = fake({ 1: { state_id: false, country_id: false }, 2: { state_id: [52, 'Texas'], country_id: [233, 'US'] }, 3: { state_id: false, country_id: [233, 'US'] }, 4: { state_id: false, country_id: [38, 'Canada'] } });
    await fillRegion(o.c, 'res.partner', [1, 2, 3, 4], '1 Oak St, Kyle, TX 78640');
    expect(o.writes()).toEqual([
      [[1], { country_id: 233, state_id: 52 }],
      [[3], { state_id: 52 }],
    ]);
  });

  it('is filled by the address split, house addresses and new Field Service locations', async () => {
    const o = fake();
    await splitAddresses(o.c, [{ id: 8, name: 'Walgreens', street: '5011 West Slaughter Lane, Austin, TX 78749', vals: { street: '5011 West Slaughter Lane', street2: '', city: 'Austin', zip: '78749' } }]);
    expect(o.writes()).toEqual([
      [[8], { street: '5011 West Slaughter Lane', street2: false, city: 'Austin', zip: '78749' }],
      [[8], { country_id: 233, state_id: 52 }],
    ]);
    await addAddress(o.c, 7, { type: 'delivery', name: '', address: '400 Main St, Kyle 78640', phone: '', email: '' });
    expect(o.calls.find((x) => x.model === 'res.partner' && x.method === 'create')?.args[0]).toMatchObject({ parent_id: 7, street: '400 Main St', state_id: 52, country_id: 233 });
    await saveAddress(o.c, 21, { type: 'delivery', name: '', address: '9 Elm St, Buda 78610', phone: '', email: '' });
    expect(o.writes().at(-1)).toEqual([[21], { country_id: 233, state_id: 52 }]);
    await locationFor(o.c as never, 7, { customer: 'Pat', address: '12 Pine Rd, Kyle 78640' });
    expect(o.calls.find((x) => x.model === 'fsm.location' && x.method === 'create')?.args[0]).toMatchObject({ name: '12 Pine Rd', state_id: 52, country_id: 233 });
  });
});
