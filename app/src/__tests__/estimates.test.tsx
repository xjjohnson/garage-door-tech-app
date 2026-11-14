import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import { addEstimate, awaitingPick, bringBack, cancelDeclined, choosing, EstimateSet, openEstimates, parseEstimates, pickEstimate, removeEstimate, switchTo } from '../lib/estimates';
import { createJob, JOBS_STORAGE_KEY, parseJobs } from '../lib/jobs';
import { addTyped, EMPTY_TICKET, Ticket } from '../lib/ticket';
import { renderApp } from '../testing/renderApp';

const line = (name: string, cents: number) => ({ name, unitCents: cents, kind: 'service' as const });
const withLine = (t: Ticket, name: string, cents: number, id: string) => addTyped(t, line(name, cents), id);
let n = 0;
const mk = () => `e${++n}`;

describe('Estimates (logic)', () => {
  it('starts another estimate beside the one being worked on', () => {
    let s: EstimateSet = { ticket: withLine(EMPTY_TICKET, 'Repair', 15000, 'a'), others: [] };
    expect(awaitingPick(s)).toBe(false);
    s = addEstimate(s, { lines: [], title: 'Replace' }, mk);
    expect(s.ticket).toMatchObject({ title: 'Replace', lines: [] });
    expect(s.others).toHaveLength(1);
    expect(s.others[0]).toMatchObject({ title: 'Estimate 1', lines: [{ name: 'Repair' }] });
    expect(choosing(s)).toBe(2);
    // An empty, never-saved estimate is replaced rather than piled up.
    const again = addEstimate(s, { lines: [] }, mk);
    expect(again.others).toHaveLength(1);
    expect(again.ticket.id).toBe(s.ticket.id);
  });

  it('switches which estimate is open and keeps the others', () => {
    let s = addEstimate({ ticket: withLine(EMPTY_TICKET, 'Repair', 15000, 'a'), others: [] }, { lines: [{ id: 'b', name: 'Door', qty: 1, unitCents: 90000, kind: 'material' }], title: 'Replace' }, mk);
    const repair = s.others[0]!;
    s = switchTo(s, repair.id!, mk);
    expect(s.ticket.title).toBe('Estimate 1');
    expect(s.others.map((t) => t.title)).toEqual(['Replace']);
  });

  it('declines the others when one is picked, and cancels their quotations in Odoo once', async () => {
    let s: EstimateSet = { ticket: { ...withLine(EMPTY_TICKET, 'Good', 10000, 'a'), order: { id: 1, name: 'S1' } }, others: [] };
    s = addEstimate(s, { lines: [], title: 'Better' }, mk);
    s = { ...s, ticket: { ...withLine(s.ticket, 'Better', 20000, 'b'), order: { id: 2, name: 'S2' } } };
    s = addEstimate(s, { lines: [], title: 'Best' }, mk);
    s = { ...s, ticket: { ...withLine(s.ticket, 'Best', 30000, 'c') } }; // never reached Odoo
    expect(awaitingPick(s)).toBe(true);

    const better = s.others.find((t) => t.title === 'Better')!;
    s = pickEstimate(s, better.id, 500, mk);
    expect(s.ticket).toMatchObject({ title: 'Better', pickedAt: 500 });
    expect(awaitingPick(s)).toBe(false);
    expect(openEstimates(s.others)).toHaveLength(0);
    const declined = Object.fromEntries(s.others.map((t) => [t.title, t]));
    expect(declined.Estimate1).toBeUndefined();
    expect(declined['Estimate 1']).toMatchObject({ declinedAt: 500, cancelPending: true, order: { id: 1 } });
    expect(declined.Best).toMatchObject({ declinedAt: 500 });
    expect(declined.Best!.cancelPending).toBeUndefined();

    const calls: { model: string; method: string; args: unknown[]; kwargs?: unknown }[] = [];
    const client = {
      call: async (model: string, method: string, args: unknown[], kwargs?: unknown) => {
        calls.push({ model, method, args, kwargs });
        return method === 'read' ? [{ state: 'draft' }] : true;
      },
    };
    const done = await cancelDeclined(client as never, s.others);
    expect(calls.filter((c) => c.method === 'action_cancel').map((c) => c.args)).toEqual([[[1]]]);
    expect(calls.find((c) => c.method === 'action_cancel')!.kwargs).toEqual({ context: { disable_cancel_warning: true } });
    expect(done.some((t) => t.cancelPending)).toBe(false);
    expect(done.every((t) => t.declinedAt === 500)).toBe(true);
  });

  it("leaves a quotation that isn't a draft any more alone", async () => {
    const calls: string[] = [];
    const client = { call: async (_m: string, method: string) => { calls.push(method); return method === 'read' ? [{ state: 'sale' }] : true; } };
    const out = await cancelDeclined(client as never, [{ lines: [], id: 'x', declinedAt: 1, cancelPending: true, order: { id: 9, name: 'S9' } }]);
    expect(calls).toEqual(['read']);
    expect(out[0]!.cancelPending).toBeUndefined();
  });

  it('brings a declined estimate back, with a new quotation if the old one was cancelled', () => {
    let s: EstimateSet = { ticket: { ...withLine(EMPTY_TICKET, 'A', 100, 'a'), order: { id: 1, name: 'S1' } }, others: [] };
    s = addEstimate(s, { lines: [], title: 'B' }, mk);
    s = { ...s, ticket: { ...withLine(s.ticket, 'B', 200, 'b'), order: { id: 2, name: 'S2' } } };
    s = pickEstimate(s, undefined, 10, mk);
    // A was declined and its quotation cancelled in Odoo.
    const a = s.others[0]!;
    s = { ...s, others: [{ ...a, cancelPending: undefined }] };
    const back = bringBack(s, a.id!, mk);
    expect(back.ticket.declinedAt).toBeUndefined();
    expect(back.ticket.order).toBeUndefined();
    expect(back.others[0]!.pickedAt).toBeUndefined();
    expect(awaitingPick(back)).toBe(true);
  });

  it('removes an estimate; one already in Odoo is cancelled there', () => {
    let s = addEstimate({ ticket: { ...withLine(EMPTY_TICKET, 'A', 100, 'a'), order: { id: 1, name: 'S1' } }, others: [] }, { lines: [], title: 'B' }, mk);
    s = { ...s, ticket: withLine(s.ticket, 'B', 200, 'b') };
    const a = s.others[0]!;
    s = removeEstimate(s, a.id!, 7);
    expect(s.others[0]).toMatchObject({ declinedAt: 7, cancelPending: true });
    // Removing the open one opens the next.
    const t = addEstimate({ ticket: withLine(EMPTY_TICKET, 'A', 100, 'a'), others: [] }, { lines: [], title: 'B' }, mk);
    const next = removeEstimate({ ...t, ticket: withLine(t.ticket, 'B', 200, 'b') }, t.ticket.id!, 7);
    expect(next.ticket.title).toBe('Estimate 1');
    expect(next.others).toEqual([]);
  });

  it('reads saved estimates and drops ones without an id', () => {
    expect(parseEstimates([{ id: 'x', lines: [], title: 'Good', declinedAt: 5, cancelPending: true }, { lines: [] }, 3])).toEqual([{ lines: [], id: 'x', title: 'Good', declinedAt: 5, cancelPending: true }]);
    expect(parseEstimates(undefined)).toEqual([]);
  });
});

describe('Estimates (screen)', () => {
  const settle = async (k = 10) => {
    for (let i = 0; i < k; i++) await act(async () => undefined);
  };
  const saved = async () => parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0]!;
  const addLine = async (name: string, price: string) => {
    await fireEvent.press(screen.getByTestId('ticket-typed-open'));
    await fireEvent.changeText(screen.getByTestId('ticket-typed-name'), name);
    await fireEvent.changeText(screen.getByTestId('ticket-typed-price'), price);
    await fireEvent.press(screen.getByTestId('ticket-typed-add'));
    await settle();
  };

  it('holds two estimates on a job and declines the other when the customer picks one', async () => {
    await AsyncStorage.clear();
    const job = createJob({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: 'Josh', address: '12 Oak St', phone: '', notes: '' }, { title: '' }, 1000, 'j1');
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([job]));
    await renderApp('/ticket/j1');
    await settle();
    expect(screen.queryByTestId('estimates')).toBeNull();
    await addLine('Repair the spring', '150');
    expect(screen.getByTestId('estimate-add')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('estimate-add'));
    await settle();
    await addLine('Replace the door', '900');

    let j = await saved();
    expect(j.ticket?.lines.map((l) => l.name)).toEqual(['Replace the door']);
    expect(j.estimates).toHaveLength(1);
    expect(j.estimates![0]!.lines.map((l) => l.name)).toEqual(['Repair the spring']);
    expect(screen.getByTestId('estimates-waiting')).toBeTruthy();

    await fireEvent.press(screen.getByTestId(`estimate-pick-${j.ticket!.id}`));
    await settle();
    j = await saved();
    expect(j.ticket?.pickedAt).toBeGreaterThan(0);
    expect(j.estimates![0]).toMatchObject({ declinedAt: expect.any(Number) });
    expect(screen.queryByTestId('estimates-waiting')).toBeNull();
    expect(screen.getByTestId(`estimate-${j.estimates![0]!.id}`)).toHaveTextContent(/Declined/);
  });
});
