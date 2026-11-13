/**
 * Odoo's customer invoices as the follow-up list sees them, kept in memory
 * while the app runs and refreshed by OdooFollowUpSync. Kept free of React
 * apart from the hook.
 */
import { useSyncExternalStore } from 'react';
import type { OdooInvoiceRow } from './odooFollowUps';

let rows: OdooInvoiceRow[] = [];
const listeners = new Set<() => void>();

export function setOdooInvoiceRows(next: OdooInvoiceRow[]) {
  rows = next;
  listeners.forEach((l) => l());
}

export function useOdooInvoiceRows(): OdooInvoiceRow[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => rows,
  );
}
