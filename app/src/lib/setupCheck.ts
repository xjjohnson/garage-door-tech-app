/**
 * The Odoo setup check: what this version of the app needs in Odoo, each
 * marked found or missing with how to fix it. It only reads; nothing in Odoo
 * is changed. Kept free of React so it can be tested with a fake Odoo.
 */
import type { OdooSession } from './odoo';
import { recurringSupport } from './odooRecurring';

export type CheckState = 'ok' | 'missing' | 'warn';

export interface CheckResult {
  id: string;
  label: string;
  state: CheckState;
  /** What was found. */
  detail: string;
  /** How to fix it, when it isn't ok. */
  fix?: string;
}

/** Just enough of OdooClient for the checks, so tests can pass a fake. */
export interface CheckClient {
  session: Pick<OdooSession, 'kind' | 'me' | 'apps' | 'name'>;
  call(model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>): Promise<unknown>;
}

async function count(c: CheckClient, model: string, domain: unknown[] = []): Promise<number | null> {
  try {
    const n = await c.call(model, 'search_count', [domain]);
    return typeof n === 'number' ? n : null;
  } catch {
    // Missing app, or this user can't read it.
    return null;
  }
}

/** True when the model exists and this user can read it. */
async function hasModel(c: CheckClient, model: string): Promise<boolean> {
  try {
    const f = await c.call(model, 'fields_get', [], { attributes: ['type'] });
    return !!f && typeof f === 'object';
  } catch {
    return false;
  }
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

export async function runSetupCheck(c: CheckClient | null): Promise<CheckResult[]> {
  if (!c) {
    return [{ id: 'signin', label: 'Signed in to Odoo', state: 'missing', detail: 'Not signed in.', fix: 'Tools > Team (Odoo), and sign in with your email and an API key.' }];
  }
  const s = c.session;
  const out: CheckResult[] = [{ id: 'signin', label: 'Signed in to Odoo', state: 'ok', detail: `As ${s.name || 'you'}.` }];

  out.push(
    s.kind === 'oca'
      ? { id: 'fsm', label: 'Field Service', state: 'ok', detail: 'Field Service orders found.' }
      : s.kind === 'task'
        ? { id: 'fsm', label: 'Field Service', state: 'warn', detail: 'Using Project tasks for jobs.', fix: 'Install the community Field Service app (fieldservice) so jobs become Field Service orders.' }
        : { id: 'fsm', label: 'Field Service', state: 'missing', detail: 'No Field Service or Project app.', fix: 'In Odoo, Apps > install Field Service (the OCA fieldservice module).' },
  );

  if (s.kind === 'oca') {
    out.push(
      s.me > 0
        ? { id: 'worker', label: 'You are a Field Service worker', state: 'ok', detail: 'Jobs can be given to you.' }
        : { id: 'worker', label: 'You are a Field Service worker', state: 'missing', detail: 'Your user has no worker record.', fix: 'Open your own contact (Settings > Users > you > Contact), tick "Is a FS Worker" on its Field Service tab, then sign in again.' },
    );
  }

  out.push(
    s.apps.sales
      ? { id: 'sales', label: 'Sales', state: 'ok', detail: 'Quotes can go to Odoo.' }
      : { id: 'sales', label: 'Sales', state: 'missing', detail: 'Sales app not found.', fix: 'In Odoo, Apps > install Sales.' },
  );

  if (s.apps.sales) {
    const n = await count(c, 'sale.order.template', [['active', '=', true]]);
    out.push(
      n === null
        ? { id: 'templates', label: 'Quotation templates', state: 'missing', detail: 'Templates are turned off.', fix: 'Sales > Configuration > Settings > turn on Quotation Templates.' }
        : n > 0
          ? { id: 'templates', label: 'Quotation templates', state: 'ok', detail: `${plural(n, 'template')}.` }
          : { id: 'templates', label: 'Quotation templates', state: 'warn', detail: 'None yet.', fix: 'Sales > Configuration > Quotation Templates. The good/better/best quotes are built from these.' },
    );
  }

  out.push(
    s.apps.invoicing
      ? { id: 'invoicing', label: 'Invoicing', state: 'ok', detail: 'Invoices and payments can go to Odoo.' }
      : { id: 'invoicing', label: 'Invoicing', state: 'missing', detail: 'Invoicing app not found.', fix: 'In Odoo, Apps > install Invoicing.' },
  );

  if (s.kind === 'oca') {
    const r = await recurringSupport(c as never).catch(() => ({ repeats: false, agreements: false }));
    out.push(
      r.repeats
        ? { id: 'recurring', label: 'Repeating visits', state: 'ok', detail: 'Field Service Recurring found.' }
        : { id: 'recurring', label: 'Repeating visits', state: 'warn', detail: 'Field Service Recurring not found.', fix: 'In Odoo, Apps > install Field Service Recurring (fieldservice_recurring) for yearly tune-ups and repeating visits.' },
      r.agreements
        ? { id: 'agreements', label: 'Service agreements', state: 'ok', detail: 'Agreements found.' }
        : { id: 'agreements', label: 'Service agreements', state: 'warn', detail: 'Agreement app not found.', fix: 'In Odoo, Apps > install Agreement (agreement) for service agreements.' },
    );
  }

  const [survey, attendance, equipment] = await Promise.all([
    hasModel(c, 'survey.survey'),
    hasModel(c, 'hr.attendance'),
    s.kind === 'oca' ? hasModel(c, 'fsm.equipment') : Promise.resolve(true),
  ]);
  out.push(
    survey
      ? { id: 'surveys', label: 'Surveys (inspections)', state: 'ok', detail: 'Survey app found.' }
      : { id: 'surveys', label: 'Surveys (inspections)', state: 'warn', detail: 'Survey app not found.', fix: 'In Odoo, Apps > install Surveys so inspections can be saved there.' },
  );
  if (s.kind === 'oca') {
    out.push(
      equipment
        ? { id: 'equipment', label: 'Equipment (doors and openers)', state: 'ok', detail: 'Field Service Equipment found.' }
        : { id: 'equipment', label: 'Equipment (doors and openers)', state: 'warn', detail: 'Field Service Equipment not found.', fix: 'In Odoo, Apps > install Field Service Equipment Stock (fieldservice_equipment_stock) so doors and openers are tracked.' },
    );
  }
  out.push(
    attendance
      ? { id: 'attendance', label: 'Attendance (time clock)', state: 'ok', detail: 'Attendances app found.' }
      : { id: 'attendance', label: 'Attendance (time clock)', state: 'warn', detail: 'Attendances app not found.', fix: 'In Odoo, Apps > install Attendances so the time clock saves there.' },
  );

  const trucks = await count(c, 'stock.location', [['usage', '=', 'internal'], ['name', 'ilike', 'truck']]);
  out.push(
    trucks === null
      ? { id: 'truck', label: 'Truck stock', state: 'warn', detail: 'Inventory not found.', fix: 'Install Inventory to track what is on each truck (needed in a later version).' }
      : trucks > 0
        ? { id: 'truck', label: 'Truck stock', state: 'ok', detail: `${plural(trucks, 'truck location')}.` }
        : { id: 'truck', label: 'Truck stock', state: 'warn', detail: 'No location named "Truck".', fix: 'Inventory > Configuration > Locations > New, named like "Truck 1" (turn on Storage Locations first).' },
  );

  const mail = await count(c, 'ir.mail_server');
  out.push(
    mail === null
      ? { id: 'email', label: 'Outgoing email', state: 'warn', detail: "Can't check (needs an admin).", fix: 'Sign in as the Odoo admin to check this.' }
      : mail > 0
        ? { id: 'email', label: 'Outgoing email', state: 'ok', detail: `${plural(mail, 'mail server')}.` }
        : { id: 'email', label: 'Outgoing email', state: 'warn', detail: 'No mail server set.', fix: "Odoo Online sends email for you. Self-hosted: Settings > Technical > Outgoing Mail Servers." },
  );
  return out;
}

export function setupSummary(results: CheckResult[]): string {
  const missing = results.filter((r) => r.state === 'missing').length;
  const warn = results.filter((r) => r.state === 'warn').length;
  if (!missing && !warn) return 'Odoo is ready for this version.';
  const parts = [missing ? `${missing} missing` : '', warn ? `${warn} to look at` : ''].filter(Boolean);
  return parts.join(', ') + '.';
}
