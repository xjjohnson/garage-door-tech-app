import { attendanceReady, myEmployee, pushShift, shiftsToSend } from '../lib/odooAttendance';
import { parseWorkLog, Shift } from '../lib/worklog';

type Call = [string, string, unknown[], Record<string, unknown>?];
function fake(handler: (model: string, method: string, args: unknown[]) => unknown) {
  const calls: Call[] = [];
  return {
    calls,
    session: { uid: 7 },
    call: async (model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>) => {
      calls.push([model, method, args, kwargs]);
      return handler(model, method, args);
    },
  } as never as Parameters<typeof pushShift>[0] & { calls: Call[]; session: { uid: number } } & Parameters<typeof myEmployee>[0];
}

const shift = (extra: Partial<Shift> = {}): Shift => ({ id: 's1', start: Date.UTC(2026, 10, 13, 14, 0), note: '', updatedAt: 1, ...extra });

describe('time clock in Odoo Attendance', () => {
  it('sees whether the Attendances app is there', async () => {
    expect(await attendanceReady(fake(() => ({ employee_id: {}, check_in: {}, check_out: {} })))).toBe(true);
    expect(await attendanceReady(fake(() => { throw new Error('Object hr.attendance doesn\'t exist'); }))).toBe(false);
  });

  it('finds my employee record', async () => {
    const c = fake(() => [{ id: 12 }]);
    expect(await myEmployee(c)).toBe(12);
    expect(c.calls[0][2]).toEqual([[['user_id', '=', 7]]]);
    expect(await myEmployee(fake(() => []))).toBeNull();
  });

  it('only sends days started after the phone began sending, and ones that changed', () => {
    const since = shift().start;
    const old = shift({ id: 'old', start: since - 1 });
    const sent = shift({ id: 'sent', odooAtt: { id: 1, start: since } });
    const edited = shift({ id: 'edited', end: since + 1000, odooAtt: { id: 2, start: since } });
    expect(shiftsToSend([old, shift(), sent, edited], since).map((s) => s.id)).toEqual(['s1', 'edited']);
  });

  it('makes a check in, then writes the check out', async () => {
    const c = fake((m, method) => (method === 'create' ? 55 : method === 'read' ? [{ id: 55 }] : true));
    const open = await pushShift(c, 12, shift());
    expect(open).toEqual({ id: 55, start: shift().start });
    expect(c.calls[0].slice(0, 3)).toEqual(['hr.attendance', 'create', [{ employee_id: 12, check_in: '2026-11-13 14:00:00', check_out: false }]]);
    const end = shift().start + 3_600_000;
    const done = await pushShift(c, 12, shift({ end, odooAtt: open }));
    expect(done).toEqual({ id: 55, start: shift().start, end });
    expect(c.calls.at(-1)?.slice(0, 3)).toEqual(['hr.attendance', 'write', [[55], { check_in: '2026-11-13 14:00:00', check_out: '2026-11-13 15:00:00' }]]);
  });

  it('makes the record again when it was deleted in Odoo', async () => {
    const c = fake((_m, method) => (method === 'read' ? [] : 99));
    expect((await pushShift(c, 12, shift({ odooAtt: { id: 55, start: shift().start } }))).id).toBe(99);
  });

  it('keeps the Odoo link when reading saved days', () => {
    const log = parseWorkLog({ shifts: [{ id: 'a', start: 5, odooAtt: { id: 3, start: 5, end: 9 } }, { id: 'b', start: 6, odooAtt: 'junk' }] });
    expect(log.shifts[0].odooAtt).toEqual({ id: 3, start: 5, end: 9 });
    expect(log.shifts[1].odooAtt).toBeUndefined();
  });
});
