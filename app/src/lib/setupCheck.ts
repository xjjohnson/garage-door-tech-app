/**
 * The Odoo setup check: what this version of the app needs in Odoo, each
 * marked found or missing with how to fix it. It only reads; nothing in Odoo
 * is changed. Kept free of React so it can be tested with a fake Odoo.
 */
import type { OdooSession } from './odoo';

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
        : { id: 'worker', label: 'You are a Field Service worker', state: 'missing', detail: 'Your user has no worker record.', fix: 'Field Service > Configuration > Workers > New, and pick your contact.' },
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
