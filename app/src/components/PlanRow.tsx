import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { MaintenancePlan, planPriceText, planSummary } from '../lib/maintenancePlans';
import type { ActivePlan } from '../lib/planSetup';
import type { TicketPlan } from '../lib/ticket';
import { colors, type, fs } from '../theme';
import { Action } from './Buttons';
import { SectionTitle } from './controls';

/** The plan on a ticket, copied so a later edit to the plan doesn't change what the customer was offered. */
export const toTicketPlan = (p: MaintenancePlan): TicketPlan => ({
  id: p.id!,
  name: p.name,
  description: p.description,
  everyMonths: p.everyMonths,
  visitsPerYear: p.visitsPerYear,
  daysAhead: p.daysAhead,
  ...(p.jobTypeId ? { jobTypeId: p.jobTypeId } : {}),
  termMonths: p.termMonths,
  renews: p.renews,
  priceCents: p.priceCents,
});

/**
 * The ticket's "Maintenance plan" row. It stays on None until the tech taps it
 * (no suggestions). Pick a plan from the ones management set up; the customer
 * signing the estimate covers it, and Odoo gets the plan and its repeating
 * visits when they accept. A customer who is already on a plan sees that.
 */
export function PlanRow({ plan, plans, locked, active, error, done, onChange, onRetry }: { plan?: TicketPlan; plans: MaintenancePlan[]; locked: boolean; active?: ActivePlan; error?: string; done: boolean; onChange: (p: TicketPlan | undefined) => void; onRetry: () => void }) {
  const [open, setOpen] = useState(false);
  if (!plan && (locked || plans.length === 0) && !active) return null;
  return (
    <View style={styles.box} testID="ticket-plan">
      <SectionTitle>Maintenance plan</SectionTitle>
      {active ? (
        <Text style={styles.meta} testID="ticket-plan-active">
          On {active.name}
          {active.end ? ` until ${active.end}` : ''}
        </Text>
      ) : null}
      <Text style={styles.label} testID="ticket-plan-current">
        {plan ? `${plan.name} · ${planPriceText(plan)}` : 'None'}
      </Text>
      {plan?.description ? <Text style={styles.meta}>{plan.description}</Text> : null}
      {plan && done ? (
        <Text style={styles.meta} testID="ticket-plan-done">
          ✓ Set up in Odoo
        </Text>
      ) : plan && !error ? (
        <Text style={styles.meta} testID="ticket-plan-waiting">
          Set up in Odoo when the customer signs the estimate or the invoice is made.
        </Text>
      ) : null}
      {error ? (
        <>
          <Text style={styles.error} testID="ticket-plan-error">
            The plan isn't set up in Odoo yet: {error}
          </Text>
          <Action label="Set up plan again" onPress={onRetry} testID="ticket-plan-retry" />
        </>
      ) : null}
      {!locked && !done && plans.length > 0 ? (
        !open ? (
          <Action label={plan ? 'Change the plan' : 'Add a plan'} onPress={() => setOpen(true)} testID="ticket-plan-open" />
        ) : (
          <>
            <Action label="None" primary={!plan} onPress={() => { onChange(undefined); setOpen(false); }} testID="ticket-plan-none" />
            {plans.map((p) => (
              <Action key={p.id} label={`${p.name} · ${planSummary(p)}`} primary={plan?.id === p.id} onPress={() => { onChange(toTicketPlan(p)); setOpen(false); }} testID={`ticket-plan-pick-${p.id}`} />
            ))}
            <Action label="Cancel" onPress={() => setOpen(false)} testID="ticket-plan-cancel" />
          </>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8 },
  label: { fontSize: type.body, fontWeight: '800', color: colors.text },
  meta: { fontSize: fs(16), color: colors.muted, lineHeight: 22 },
  error: { fontSize: fs(16), fontWeight: '700', color: colors.stop },
});
