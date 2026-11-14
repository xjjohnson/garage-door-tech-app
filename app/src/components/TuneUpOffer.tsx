import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { fetchRepeats, hasOpenTuneUp, isRepairJob, offerTuneUpPlan, recurringSupport } from '../lib/odooRecurring';
import { useOdoo } from '../lib/useOdoo';
import { colors, type } from '../theme';
import { Action } from './Buttons';

/**
 * After a repair is done: one tap offers the customer the yearly tune-up plan.
 * It makes the repeating "Annual tune-up" visit at their house and a
 * record-only agreement under it in Odoo. Nothing shows for a tune-up job, with
 * no Odoo, or when the house already has a repeating visit.
 */
export function TuneUpOffer({ partnerId, customer, address, what, workDone, now = Date.now }: { partnerId: number | undefined; customer: string; address: string; what: string | undefined; workDone: boolean; now?: () => number }) {
  const { client } = useOdoo();
  const [state, setState] = useState<'hidden' | 'offer' | 'busy' | 'made' | 'hide'>('hidden');
  const [problem, setProblem] = useState<string | null>(null);
  const ready = !!client && client.session.kind === 'oca' && !!partnerId && workDone && isRepairJob(what);
  useEffect(() => {
    if (!ready || !client || !partnerId) return;
    let live = true;
    (async () => {
      const { repeats } = await recurringSupport(client);
      if (!repeats) return;
      const open = hasOpenTuneUp(await fetchRepeats(client, partnerId), address);
      if (live && !open) setState((s) => (s === 'hidden' ? 'offer' : s));
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, [ready, client, partnerId, address]);

  if (!ready || state === 'hidden' || state === 'hide') return null;
  if (state === 'made')
    return (
      <View style={styles.card} testID="tuneup-made">
        <Text style={styles.title}>Tune-up plan saved to Odoo</Text>
        <Text style={styles.body}>The first visit is a year out. Odoo makes it as a job about 30 days before.</Text>
      </View>
    );
  const take = async () => {
    if (!client || !partnerId) return;
    setState('busy');
    setProblem(null);
    try {
      await offerTuneUpPlan(client, partnerId, { customer, address }, now());
      setState('made');
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
      setState('offer');
    }
  };
  return (
    <View style={styles.card} testID="tuneup-offer">
      <Text style={styles.title}>Offer a yearly tune-up plan?</Text>
      <Text style={styles.body}>One tap sets up a tune-up visit every year at this house, with a plan record in Odoo. It does not bill anything and texts nobody.</Text>
      {problem ? (
        <Text style={styles.error} testID="tuneup-error">
          {problem}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Action label={state === 'busy' ? 'Saving to Odoo...' : 'Customer said yes'} primary grow disabled={state === 'busy'} onPress={take} testID="tuneup-yes" />
        <Action label="Not now" grow disabled={state === 'busy'} onPress={() => setState('hide')} testID="tuneup-no" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 12, gap: 8 },
  title: { fontSize: type.body, fontWeight: '900', color: colors.text },
  body: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  error: { fontSize: 16, fontWeight: '700', color: colors.stop },
  row: { flexDirection: 'row', gap: 8 },
});
