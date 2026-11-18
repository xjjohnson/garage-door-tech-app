import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { baseOf, searchProducts } from '../lib/odooStock';
import { StockProvider, useStock } from '../lib/useStock';

/** A fake Odoo with one Genie 1028 product and its variants, the way Odoo names them. */
function genie() {
  const rows = [
    { id: 1, name: 'Genie 1028', display_name: 'Genie 1028 (Head Only)', default_code: '1028', barcode: false, standard_price: 0, product_tmpl_id: [9, 'Genie 1028'], categ_id: [2, 'All / Openers'] },
    { id: 2, name: 'Genie 1028', display_name: 'Genie 1028 (8ft Belt)', default_code: '1028-8b', barcode: false, standard_price: 0, product_tmpl_id: [9, 'Genie 1028'], categ_id: [2, 'All / Openers'] },
    { id: 3, name: 'Genie 1128', display_name: 'Genie 1128 (7ft, Belt)', default_code: '', barcode: false, standard_price: 0, product_tmpl_id: [10, 'Genie 1128'], categ_id: [2, 'All / Openers'] },
  ];
  const searched: unknown[] = [];
  const client = {
    session: { uid: 1 },
    call: async (_m: string, method: string, args: unknown[]) => {
      if (method === 'search') {
        searched.push(args[0]);
        const dom = args[0] as unknown[][];
        const want = String((dom.find((d) => Array.isArray(d) && d[0] === 'name') as unknown[])[2]).toLowerCase();
        return rows.filter((r) => r.name.toLowerCase().includes(want)).map((r) => r.id);
      }
      if (method === 'read') return rows.filter((r) => (args[0] as number[]).includes(r.id));
      return [];
    },
  };
  return { client: client as never, searched };
}

describe('the part picker shows variants', () => {
  it('tells variants apart by their full name', async () => {
    const o = genie();
    const found = await searchProducts(o.client, 'Genie 1028');
    expect(found.map((p) => p.name)).toEqual(['Genie 1028 (Head Only)', 'Genie 1028 (8ft Belt)']);
    expect(found[0]).toMatchObject({ baseName: 'Genie 1028', variant: 'Head Only', code: '1028' });
  });

  it('finds the variant a ticket line names, and never comes back empty for one that exists', async () => {
    const o = genie();
    expect(baseOf('Genie 1028 (Head Only)')).toBe('Genie 1028');
    expect((await searchProducts(o.client, 'Genie 1028 (Head Only)')).map((p) => p.id)).toEqual([1]);
    expect((await searchProducts(o.client, 'genie 1028 (8ft belt)')).map((p) => p.id)).toEqual([2]);
    // A choice Odoo doesn't have: the product's variants to pick from, not "no match".
    expect((await searchProducts(o.client, 'Genie 1028 (Chain)')).map((p) => p.id)).toEqual([1, 2]);
    // A product that really isn't there stays empty, so Make is still offered.
    expect(await searchProducts(o.client, 'Sommer 9999 (Belt)')).toEqual([]);
  });
});

describe('a tech may look at truck stock but not change it', () => {
  let api!: ReturnType<typeof useStock>;
  function Grab() {
    api = useStock();
    return <Text testID="n">{api.items.map((i) => `${i.name}:${i.onHand}`).join(',')}</Text>;
  }
  const start = async () => {
    await render(
      <StockProvider>
        <Grab />
      </StockProvider>,
    );
    await act(async () => undefined);
    let id = '';
    await act(async () => {
      id = api.add({ name: 'Roller', sku: '', category: 'parts', onHand: 5, min: 1, par: 3, supplier: '', costCents: 0 });
    });
    return id;
  };

  it('ignores hand changes while locked, and lets them through again when unlocked', async () => {
    const id = await start();
    await act(async () => api.setLocked(true));
    await act(async () => {
      api.adjust(id, 1);
      api.update(id, { onHand: 50 });
      api.addStarter();
      api.add({ name: 'Extra', sku: '', category: 'parts', onHand: 1, min: 1, par: 1, supplier: '', costCents: 0 });
      api.remove(id);
    });
    expect(screen.getByTestId('n')).toHaveTextContent('Roller:5');
    // Using a part on a job still takes it off the truck.
    await act(async () => api.takeParts(id, 2, 'job-1'));
    expect(screen.getByTestId('n')).toHaveTextContent('Roller:3');
    await act(async () => api.setLocked(false));
    await act(async () => api.adjust(id, 1));
    expect(screen.getByTestId('n')).toHaveTextContent('Roller:4');
  });
});
