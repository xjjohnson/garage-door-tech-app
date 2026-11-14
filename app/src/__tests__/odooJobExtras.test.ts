import { currentTemplate, fetchJobTags, setJobTags, switchTemplate } from '../lib/odooJobExtras';

type Call = { model: string; method: string; args: unknown[]; kwargs?: Record<string, unknown> };

function fake(fields: string[] = ['template_id', 'todo', 'type'], hasTags = true) {
  const calls: Call[] = [];
  const client = {
    session: { kind: 'oca', fields },
    call: async (model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>) => {
      calls.push({ model, method, args, kwargs });
      if (method === 'fields_get') return hasTags ? { tag_ids: { type: 'many2many' } } : {};
      if (model === 'fsm.tag') return [{ id: 1, name: 'Warranty' }, { id: 2, name: 'Commercial' }];
      if (model === 'fsm.order' && method === 'read') return [{ tag_ids: [2], template_id: [9, 'Spring'] }];
      return true;
    },
  };
  return { client: client as never, calls };
}

describe('job tags and templates in Odoo', () => {
  it('reads the tags on offer and on the order, and writes the full set back', async () => {
    const { client, calls } = fake();
    expect(await fetchJobTags(client, 5)).toEqual({ all: [{ id: 1, name: 'Warranty' }, { id: 2, name: 'Commercial' }], on: [2] });
    await setJobTags(client, 5, [1, 2]);
    expect(calls.at(-1)).toMatchObject({ model: 'fsm.order', method: 'write', args: [[5], { tag_ids: [[6, 0, [1, 2]]] }] });
  });

  it('shows no tags when this Odoo has none on orders', async () => {
    expect(await fetchJobTags(fake([], false).client, 5)).toBeNull();
  });

  it('reads and switches the order template', async () => {
    const { client, calls } = fake();
    expect(await currentTemplate(client, 5)).toBe(9);
    await switchTemplate(client, 5, { id: 12, name: 'Opener', instructions: 'Check travel', typeId: 3 });
    expect(calls.at(-1)).toMatchObject({ model: 'fsm.order', method: 'write', args: [[5], { template_id: 12, todo: 'Check travel', type: 3 }] });
  });

  it('refuses to switch when orders have no template field', async () => {
    await expect(switchTemplate(fake([]).client, 5, { id: 1, name: 'x', instructions: '' })).rejects.toThrow(/no template field/);
  });
});
