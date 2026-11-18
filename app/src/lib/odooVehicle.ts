/**
 * The Vehicle on an Odoo job (OCA Field Service Vehicles). The app fills it
 * from the assigned tech's own truck, only when that is clear: exactly one
 * vehicle lists them as its driver. No truck, or two, leaves it as it is.
 * Kept free of React.
 */
import type { OdooClient } from './odoo';

type Caller = Pick<OdooClient, 'call' | 'session'>;

/** The vehicle field to write for this tech, or nothing. Never throws: the Vehicle is a nice-to-have on the job. */
export async function vehicleVals(c: Caller, personId: number | undefined): Promise<Record<string, unknown>> {
  if (!personId || c.session.kind !== 'oca' || !c.session.fields.includes('vehicle_id')) return {};
  try {
    const rows = (await c.call('fsm.vehicle', 'search', [[['person_id', '=', personId]]], { limit: 2 })) as number[];
    return rows.length === 1 ? { vehicle_id: rows[0] } : {};
  } catch {
    return {};
  }
}
