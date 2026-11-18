import { render, screen } from '@testing-library/react-native';
import type { OdooClient, OdooTask } from '../lib/odoo';
import { buildPins, FollowUpsDue, TimeOff, TruckAlerts, WhoIsWorking, whoIsWorking } from '../screens/DispatchTeamPages';

const NOW = Date.UTC(2026, 10, 18, 18, 0);
const task = (id: number, tech: number, address: string, startMin: number): OdooTask => ({ id, name: `J${id}`, customer: '', phone: '', address, notes: '', stage: '', assignees: [tech], start: NOW + startMin * 60_000 });

describe('who is working', () => {
  it('matches clocked-in names to workers, ignoring case, and attaches the truck position', () => {
    const techs = [{ id: 1, name: 'Sam Ruiz', login: '' }, { id: 2, name: 'Lee Park', login: '' }];
    const r = whoIsWorking(techs, [{ name: 'sam ruiz', since: NOW - 3600_000 }], [{ id: 2, name: 'Lee Park', lat: 1, lon: 2, at: NOW }]);
    expect(r[0]).toMatchObject({ since: NOW - 3600_000 });
    expect(r[0]!.position).toBeUndefined();
    expect(r[1]!.since).toBeUndefined();
    expect(r[1]!.position?.id).toBe(2);
  });
});

describe('map pins', () => {
  it("numbers each tech's stops in time order, one color per tech, and adds a dot per truck", () => {
    const jobs = [task(1, 7, 'A', 60), task(2, 7, 'B', 0), task(3, 8, 'C', 0), task(4, 8, 'unknown', 30)];
    const points = { A: { lat: 1, lon: 1 }, B: { lat: 2, lon: 2 }, C: { lat: 3, lon: 3 }, unknown: null };
    const techs = [{ id: 7, name: 'Sam Ruiz', login: '' }];
    const pins = buildPins(jobs, points, techs, [{ id: 7, name: 'Sam Ruiz', lat: 9, lon: 9, at: NOW - 3600_000 }], NOW);
    const job = (id: string) => pins.find((p) => p.id === id)!;
    expect([job('job-2').label, job('job-1').label, job('job-3').label]).toEqual(['1', '2', '1']);
    expect(job('job-1').color).toBe(job('job-2').color);
    expect(job('job-1').color).not.toBe(job('job-3').color);
    expect(pins.find((p) => p.id === 'job-4')).toBeUndefined();
    expect(job('tech-7')).toMatchObject({ label: 'SR', kind: 'next', dim: true });
  });
});

const clientWith = (answers: Record<string, unknown>) =>
  ({
    session: {},
    techs: async () => [],
    call: async (model: string, method: string) => {
      const v = answers[`${model}.${method}`];
      if (v instanceof Error) throw v;
      return v ?? [];
    },
  }) as unknown as OdooClient;

describe('team pages', () => {
  it('lists time off, and says plainly when there is none', async () => {
    await render(<TimeOff client={clientWith({ 'hr.leave.search_read': [{ id: 1, employee_id: [5, 'Sam Ruiz'], date_from: '2026-11-20 08:00:00', date_to: '2026-11-21 17:00:00' }] })} now={() => NOW} />);
    expect(await screen.findByText('Sam Ruiz')).toBeTruthy();
    await render(<TimeOff client={clientWith({})} now={() => NOW} />);
    expect(await screen.findByTestId('dispatch-timeoff-empty')).toBeTruthy();
  });

  it("explains when Odoo won't show a page to this login instead of crashing", async () => {
    await render(<WhoIsWorking client={clientWith({ 'hr.attendance.search_read': new Error('Access denied') })} now={() => NOW} />);
    expect(await screen.findByTestId('dispatch-read-error')).toBeTruthy();
    await render(<FollowUpsDue client={clientWith({ 'mail.activity.search_read': new Error('Access denied') })} now={() => NOW} />);
    expect(await screen.findByText('Follow-ups due')).toBeTruthy();
  });

  it('lists follow-ups due and says so when no truck is below minimum', async () => {
    await render(<FollowUpsDue client={clientWith({ 'mail.activity.search_read': [{ id: 3, res_name: 'Kim Ortega', summary: 'Tune-up call', date_deadline: '2026-11-17', user_id: [2, 'Dee'] }] })} now={() => NOW} />);
    expect(await screen.findByText('Kim Ortega')).toBeTruthy();
    await render(<TruckAlerts client={clientWith({})} />);
    expect(await screen.findByTestId('dispatch-trucks-empty')).toBeTruthy();
  });
});
