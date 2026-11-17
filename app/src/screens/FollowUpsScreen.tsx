import { router } from 'expo-router';
import { invoiceNo } from '../lib/invoices';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { NewFollowUpSheet, dayAhead } from '../components/PlanSheets';
import { completeActivity, createManualFollowUp, fetchMyTodos, TodoRow } from '../lib/odooFollowUps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { endText, ensureRenewalTodo, fetchPlanRenewals, RenewalRow } from '../lib/planRecords';
import { useMaintenancePlans } from '../lib/useMaintenancePlans';
import { useOdoo } from '../lib/useOdoo';
import { DAY, followUpId, followUps, textLink } from '../lib/followups';
import { formatJobDate } from '../lib/jobs';
import { useCustomers } from '../lib/useCustomers';
import { useFollowUps } from '../lib/useFollowUps';
import { useInvoices } from '../lib/useInvoices';
import { colors, touch, type } from '../theme';

const PLAN_TODOS_KEY = 'plan-renewal-todos/v1';

/**
 * Repeat work that's due: tune-ups, springs near the end of their life and
 * warranties about to end, each with a text to the customer ready to send.
 */
export function FollowUpsScreen({ now = Date.now }: { now?: () => number }) {
  const { invoices, business } = useInvoices();
  const { customers } = useCustomers();
  const { settings, dismissed, dismiss } = useFollowUps();
  const { client } = useOdoo();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [todos, setTodos] = useState<TodoRow[] | null>(null);
  const [todoError, setTodoError] = useState<string | null>(null);
  const loadTodos = useCallback(async () => {
    if (!client) return;
    try {
      setTodos(await fetchMyTodos(client));
      setTodoError(null);
    } catch (e) {
      setTodoError(e instanceof Error ? e.message : String(e));
    }
  }, [client]);
  useEffect(() => {
    loadTodos();
  }, [loadTodos]);
  // Maintenance plans about to end (60 days) or ended in the last 30: each gets a renewal to-do in Odoo once, and a Renew button.
  const plans = useMaintenancePlans();
  const [renewals, setRenewals] = useState<RenewalRow[]>([]);
  const planNames = plans.map((p) => p.id).join(',');
  useEffect(() => {
    if (!client || plans.length === 0) return;
    let live = true;
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    fetchPlanRenewals(client, plans, day(now() - 30 * DAY), day(now() + 60 * DAY))
      .then(async (rows) => {
        if (!live) return;
        setRenewals(rows);
        // Once per plan end on this phone, so a to-do marked done in Odoo is not made again.
        const raw = await AsyncStorage.getItem(PLAN_TODOS_KEY).catch(() => null);
        const seen = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
        for (const r of rows) {
          const key = `${r.agreementId}:${r.end}`;
          if (!r.end || seen.has(key) || (r.daysLeft ?? 99) > (plans.find((p) => p.id === r.planId)?.noticeDays ?? 30)) continue;
          try {
            await ensureRenewalTodo(client, r.partnerId, { agreementId: r.agreementId, name: r.name, end: r.end, customer: r.customer });
            seen.add(key);
          } catch {
            // Try again next time.
          }
        }
        AsyncStorage.setItem(PLAN_TODOS_KEY, JSON.stringify([...seen])).catch(() => undefined);
        if (live) loadTodos();
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, planNames]);
  const list = useMemo(() => followUps(invoices, settings, business, now(), dismissed), [invoices, settings, business, dismissed, now]);
  const t = now();
  const t0 = t;

  const phoneFor = (customerId?: string) => customers.find((c) => c.id === customerId)?.phone ?? '';
  const withOdoo = customers.filter((c) => c.odooId).map((c) => ({ id: c.odooId as number, name: c.name || c.address || 'Customer' }));

  return (
    <View style={styles.stack} testID="followups">
      {client ? <Action label="New follow-up" primary onPress={() => { setProblem(null); setAdded(false); setAdding(true); }} testID="followup-new" /> : null}
      {added ? <Text style={styles.meta} testID="followup-added">Added as a to-do on the customer in Odoo.</Text> : null}
      <NewFollowUpSheet
        visible={adding}
        customers={withOdoo}
        busy={busy}
        error={problem}
        onCancel={() => setAdding(false)}
        onSave={async (f) => {
          if (!client || f.customerId === undefined) return;
          setBusy(true);
          setProblem(null);
          try {
            await createManualFollowUp(client, f.customerId, { title: f.title, note: f.note, due: dayAhead(f.days, Date.now()) });
            setAdding(false);
            setAdded(true);
            loadTodos();
          } catch (e) {
            setProblem(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      />
      {todoError ? <Text style={styles.meta} testID="followup-todo-error">Couldn&apos;t read your to-dos from Odoo: {todoError}</Text> : null}
      {renewals.map((r) => {
        const mine = customers.find((c) => c.odooId === r.partnerId);
        const plan = plans.find((p) => p.id === r.planId);
        return (
          <View key={`plan-${r.agreementId}`} style={[styles.item, r.status === 'Ended' && styles.overdue]} testID={`followup-plan-${r.agreementId}`}>
            <Text style={styles.title}>{r.name}</Text>
            <Text style={styles.detail}>{r.customer}</Text>
            <Text style={styles.meta}>{endText(r.daysLeft)} · maintenance plan</Text>
            <View style={styles.row}>
              {mine ? <Action label="Customer" grow onPress={() => router.push({ pathname: '/customer/[id]', params: { id: mine.id } })} testID={`followup-plan-customer-${r.agreementId}`} /> : null}
              {plan && mine ? <Action label="Renew" primary grow onPress={() => router.push({ pathname: '/new-job', params: { customer: mine.id, plan: String(plan.id) } })} testID={`followup-plan-renew-${r.agreementId}`} /> : null}
            </View>
          </View>
        );
      })}
      {(todos ?? []).map((t) => {
        const mine = customers.find((c) => c.odooId === t.partnerId);
        const overdue = !!t.due && Date.parse(t.due) < t0 - DAY;
        return (
          <View key={`todo-${t.id}`} style={[styles.item, overdue && styles.overdue]} testID={`followup-todo-${t.id}`}>
            <Text style={styles.title}>{t.title}</Text>
            <Text style={styles.detail}>{t.customer || mine?.name || 'Customer'}</Text>
            <Text style={styles.meta}>{t.due ? `${overdue ? 'Due since' : 'Due'} ${t.due}` : 'No date'} · to-do in Odoo</Text>
            {t.note ? <Text style={styles.meta}>{t.note}</Text> : null}
            <View style={styles.row}>
              {mine ? <Action label="Customer" grow onPress={() => router.push({ pathname: '/customer/[id]', params: { id: mine.id } })} testID={`followup-todo-customer-${t.id}`} /> : null}
              <Action
                label="Done"
                grow
                onPress={() => {
                  if (client) completeActivity(client, t.id).then(loadTodos).catch((e) => setTodoError(e instanceof Error ? e.message : String(e)));
                }}
                testID={`followup-todo-done-${t.id}`}
              />
            </View>
          </View>
        );
      })}
      {list.length === 0 && (todos ?? []).length === 0 && renewals.length === 0 ? (
        <View style={styles.empty} testID="followups-empty">
          <Text style={styles.emptyTitle}>Nothing due</Text>
          <Text style={styles.emptyBody}>Springs near the end of their life and warranties about to end show up here from your invoices, 45 days ahead. Yearly tune-ups are repeating visits on the customer's page.</Text>
        </View>
      ) : null}
      {list.map((f) => {
        const id = followUpId(f.kind, f.invoice);
        const sms = textLink(phoneFor(f.invoice.customerId), f.message);
        const overdue = f.due < t;
        return (
          <View key={id} style={[styles.item, overdue && styles.overdue]} testID={`followup-${id}`}>
            <Text style={styles.title}>{f.title}</Text>
            <Text style={styles.detail}>
              {f.invoice.billTo || 'Customer'}
              {f.invoice.address ? `, ${f.invoice.address}` : ''}
            </Text>
            <Text style={styles.meta}>
              {overdue ? 'Due since' : 'Due'} {formatJobDate(f.due)} · from invoice {invoiceNo(f.invoice)}, {formatJobDate(f.invoice.createdAt)}
            </Text>
            {sms ? (
              <Action label="Text the customer" primary onPress={() => Linking.openURL(sms).catch(() => undefined)} testID={`followup-text-${id}`} />
            ) : (
              <Text style={styles.meta}>No phone number saved for this customer.</Text>
            )}
            <View style={styles.row}>
              {f.invoice.customerId ? (
                <Action label="Customer" grow onPress={() => router.push({ pathname: '/customer/[id]', params: { id: f.invoice.customerId! } })} testID={`followup-customer-${id}`} />
              ) : null}
              <Action label="Done" grow onPress={() => dismiss(id)} testID={`followup-done-${id}`} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Action({ label, onPress, primary, grow, testID }: { label: string; onPress: () => void; primary?: boolean; grow?: boolean; testID?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={testID} style={({ pressed }) => [styles.button, grow && styles.grow, primary && styles.primary, pressed && styles.pressed]}>
      {({ pressed }) => <Text style={[styles.buttonText, primary && !pressed && styles.primaryText]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  empty: { padding: 12, borderRadius: 14, backgroundColor: colors.card, gap: 6 },
  emptyTitle: { fontSize: type.body, fontWeight: '800', color: colors.text },
  emptyBody: { fontSize: 16, color: colors.text, lineHeight: 22 },
  item: { padding: 12, gap: 6, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border },
  overdue: { borderWidth: 4, borderColor: colors.caution },
  title: { fontSize: type.value, fontWeight: '800', color: colors.text },
  detail: { fontSize: type.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: 16, fontWeight: '600', color: colors.muted },
  row: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
  button: { minHeight: touch.min, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.card },
  primary: { backgroundColor: colors.selected },
  pressed: { backgroundColor: colors.info },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  primaryText: { color: colors.onSelected },
});
