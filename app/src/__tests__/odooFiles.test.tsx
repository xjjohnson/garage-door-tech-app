import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { OdooFiles } from '../components/OdooFiles';
import { customerTargets, kindOf, listFiles } from '../lib/odooFiles';

type Call = { model: string; method: string; args: unknown[] };
function fake(rows: Record<string, unknown>[], extra: Record<string, unknown[]> = {}) {
  const calls: Call[] = [];
  const client = {
    call: async (model: string, method: string, args: unknown[]) => {
      calls.push({ model, method, args });
      if (model === 'ir.attachment' && method === 'search_read') return rows;
      if (model === 'ir.attachment' && method === 'read') return [{ datas: 'QUJD' }];
      return extra[model] ?? [];
    },
  };
  return { client, calls };
}

const rows = [
  { id: 3, name: 'After photo.jpg', mimetype: 'image/jpeg', create_date: '2026-11-17 20:40:00', file_size: 1000, type: 'binary' },
  { id: 2, name: 'INV-0148.pdf', mimetype: 'application/pdf', create_date: '2026-11-17 21:00:00', file_size: 5000, type: 'binary' },
  { id: 4, name: 'johnsons-settings.json', mimetype: 'application/json', create_date: '2026-11-17 21:00:00', file_size: 10, type: 'binary' },
  { id: 5, name: 'link', mimetype: false, create_date: false, file_size: 0, type: 'url' },
];

describe('files Odoo holds for a job (logic)', () => {
  it('tells pictures, PDFs and other files apart', () => {
    expect(kindOf('image/png', 'a')).toBe('image');
    expect(kindOf(false, 'x.PDF')).toBe('pdf');
    expect(kindOf('text/csv', 'x.csv')).toBe('other');
  });

  it('asks for every record at once, and leaves out app data files and links', async () => {
    const { client, calls } = fake(rows);
    const files = await listFiles(client, [{ model: 'fsm.order', id: 5 }, { model: 'account.move', id: 9 }, { model: 'account.move', id: 10 }]);
    expect(files.map((f) => [f.id, f.kind])).toEqual([[3, 'image'], [2, 'pdf']]);
    expect(files[0].at).toBe(Date.UTC(2026, 10, 17, 20, 40));
    expect(calls[0].args[0]).toEqual(['|', '&', ['res_model', '=', 'fsm.order'], ['res_id', 'in', [5]], '&', ['res_model', '=', 'account.move'], ['res_id', 'in', [9, 10]]]);
    expect(await listFiles(client, [])).toEqual([]);
  });

  it("gathers a customer's contact, jobs, orders and invoices, skipping a model Odoo won't read", async () => {
    const { client } = fake([], { 'fsm.location': [{ id: 11 }], 'fsm.order': [{ id: 21 }, { id: 22 }], 'sale.order': [{ id: 31 }] });
    const t = await customerTargets({ call: async (m: string, me: string, a: unknown[], k?: unknown) => (m === 'account.move' ? Promise.reject(new Error('no')) : client.call(m, me, a)) } as never, 7, 'fsm.order');
    expect(t).toEqual([{ model: 'res.partner', id: 7 }, { model: 'fsm.order', id: 21 }, { model: 'fsm.order', id: 22 }, { model: 'sale.order', id: 31 }]);
  });
});

jest.mock('../lib/useOdoo', () => ({ useOdoo: () => ({ client: (globalThis as unknown as { __c: unknown }).__c }) }));
jest.mock('../lib/useAttachments', () => ({ useAttachments: () => ({ media: { openPdf: (globalThis as unknown as { __open: jest.Mock }).__open } }) }));

describe('Odoo files on a job', () => {
  it('shows pictures and documents, leaves out photos this phone already shows, and opens a PDF', async () => {
    const { client } = fake(rows);
    const open = jest.fn(async () => undefined);
    Object.assign(globalThis, { __c: client, __open: open });
    await render(<OdooFiles targets={[{ model: 'fsm.order', id: 5 }]} mine={[]} />);
    expect(await screen.findByTestId('odoo-doc-2')).toBeTruthy();
    expect(screen.getByTestId('odoo-photo-3')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('odoo-doc-2'));
    });
    expect(open).toHaveBeenCalledWith('QUJD', 'INV-0148.pdf');
  });

  it('leaves out a photo that came from this phone', async () => {
    const { client } = fake(rows);
    Object.assign(globalThis, { __c: client, __open: jest.fn() });
    await render(<OdooFiles targets={[{ model: 'fsm.order', id: 5 }]} mine={[3]} />);
    expect(await screen.findByTestId('odoo-doc-2')).toBeTruthy();
    expect(screen.queryByTestId('odoo-photo-3')).toBeNull();
  });
});
