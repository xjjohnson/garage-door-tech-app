import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { addEstimate, awaitingPick, bringBack, choosing, EstimateSet, estimateName, pickEstimate, removeEstimate, renameEstimate, switchTo } from '../lib/estimates';
import { formatMoney } from '../lib/prices';
import { formatJobDate } from '../lib/jobs';
import { currentTotals, estimateTotals, signedNow, Ticket } from '../lib/ticket';
import { colors, type } from '../theme';
import { Action } from './Buttons';
import { SignatureResult, SignatureSheet } from './SignaturePad';
import { SectionTitle } from './controls';

const list0 = (s: EstimateSet): Ticket[] => [s.ticket, ...s.others];

/** What the customer would pay for an estimate: Odoo's total when it has priced it, else the phone's guess. */
const totalOf = (t: Ticket, taxPercent: string) => (currentTotals(t) ?? estimateTotals(t, taxPercent)).total;

/**
 * A job's estimates: Good, Better and Best, or a repair against a replacement,
 * each its own quotation in Odoo. The one open below is the ticket being worked
 * on. Picking one declines the rest (cancelled in Odoo, kept here as Declined).
 */
export function EstimatesPanel({ set, taxPercent, locked, onChange, now, customer, onSign }: { set: EstimateSet; taxPercent: string; locked: boolean; onChange: (fn: (s: EstimateSet) => EstimateSet) => void; now: () => number; customer?: string; onSign?: (estimateId: string | undefined, s: SignatureResult) => void }) {
  const [renaming, setRenaming] = useState(false);
  // The estimate being signed: its id, or '' for the lone estimate that has no id yet.
  const [signing, setSigning] = useState<string | null>(null);
  const signTarget = signing === null ? undefined : list0(set).find((t) => (t.id ?? '') === signing);
  const list = list0(set);
  const many = list.length > 1;
  const waiting = awaitingPick(set);
  const mkId = () => `e${now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  if (!many && (locked || set.ticket.lines.length === 0)) return null;
  return (
    <View style={styles.box} testID="estimates">
      <SectionTitle>{many ? `Estimates (${choosing(set)} to choose from)` : 'Estimates'}</SectionTitle>
      {many ? (
        list.map((t, i) => {
          const active = t.id === set.ticket.id;
          const declined = !!t.declinedAt;
          return (
            <View key={t.id ?? 'ticket'} style={[styles.card, active && styles.cardOn, declined && styles.cardOff]} testID={`estimate-${t.id}`}>
              <View style={styles.top}>
                <Text style={styles.name}>{estimateName(t, i)}</Text>
                <Text style={[styles.amount, declined && styles.struck]}>{formatMoney(totalOf(t, taxPercent))}</Text>
              </View>
              <Text style={styles.meta}>
                {declined ? 'Declined' : t.pickedAt ? 'Picked by the customer' : active ? 'Open below' : 'Open'}
                {t.order ? ` · quotation ${t.order.name}` : ''}
                {declined && t.cancelPending ? ' · cancelling in Odoo when online' : ''}
              </Text>
              {t.signed ? (
                <Text style={signedNow(t) ? styles.signed : styles.meta} testID={`estimate-signed-${t.id}`}>
                  {signedNow(t) ? `✓ Signed by ${t.signed.by || 'the customer'} on ${formatJobDate(t.signed.at)}${t.signed.sent ? ' · saved on the quotation in Odoo' : ''}` : 'Changed since the customer signed. Have them sign again.'}
                </Text>
              ) : null}
              {!locked && !declined && onSign && t.lines.length > 0 ? (
                <Action label={signedNow(t) ? 'Sign again' : waiting ? 'Customer signs to pick this one' : 'Customer signs to approve'} onPress={() => setSigning(t.id ?? '')} testID={`estimate-sign-${t.id}`} />
              ) : null}
              {!locked ? (
                <View style={styles.buttons}>
                  {!active && !declined ? <Action label="Open" onPress={() => onChange((s) => switchTo(s, t.id!, mkId))} testID={`estimate-open-${t.id}`} /> : null}
                  {declined ? <Action label="Bring back" onPress={() => onChange((s) => bringBack(s, t.id!, mkId))} testID={`estimate-back-${t.id}`} /> : null}
                  {!declined && !t.pickedAt && waiting ? <Action label="Customer picked this one" primary onPress={() => onChange((s) => pickEstimate(s, t.id, now(), mkId))} testID={`estimate-pick-${t.id}`} /> : null}
                  {!declined ? <Action label="Remove" onPress={() => onChange((s) => removeEstimate(s, t.id!, now()))} testID={`estimate-remove-${t.id}`} /> : null}
                </View>
              ) : null}
            </View>
          );
        })
      ) : null}
      {!many && set.ticket.lines.length > 0 ? (
        <View style={styles.card} testID="estimate-single">
          {set.ticket.signed ? (
            <Text style={signedNow(set.ticket) ? styles.signed : styles.meta} testID="estimate-signed-single">
              {signedNow(set.ticket) ? `✓ Signed by ${set.ticket.signed.by || 'the customer'} on ${formatJobDate(set.ticket.signed.at)}${set.ticket.signed.sent ? ' · saved on the quotation in Odoo' : ''}` : 'Changed since the customer signed. Have them sign again.'}
            </Text>
          ) : null}
          {!locked && onSign ? <Action label={signedNow(set.ticket) ? 'Sign again' : 'Customer signs to approve'} onPress={() => setSigning(set.ticket.id ?? '')} testID="estimate-sign-single" /> : null}
        </View>
      ) : null}
      {onSign ? (
        <SignatureSheet
          visible={!!signTarget}
          title="Approve the estimate"
          agreement={signTarget ? `I approve ${signTarget.title?.trim() ? `"${signTarget.title.trim()}"` : 'this estimate'} for ${formatMoney(totalOf(signTarget, taxPercent))}.` : ''}
          initialName={customer ?? ''}
          onCancel={() => setSigning(null)}
          onSave={(sig) => {
            const id = signTarget?.id;
            setSigning(null);
            onSign(id, sig);
          }}
        />
      ) : null}
      {many && !locked ? (
        renaming ? (
          <TextInput
            value={set.ticket.title ?? ''}
            onChangeText={(v) => set.ticket.id && onChange((s) => renameEstimate(s, s.ticket.id!, v))}
            onEndEditing={() => setRenaming(false)}
            onSubmitEditing={() => setRenaming(false)}
            placeholder="Name this estimate (Good, Replace it...)"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Estimate name"
            testID="estimate-name"
            style={styles.input}
            autoFocus
          />
        ) : (
          <Action label="Rename the open estimate" onPress={() => setRenaming(true)} testID="estimate-rename" />
        )
      ) : null}
      {waiting && !locked ? <Text style={styles.meta} testID="estimates-waiting">Show the customer each one. When they pick, tap "Customer picked this one" and the others are cancelled in Odoo. Create invoice does the same for the one open below.</Text> : null}
      {!locked ? <Action label="+ Add another estimate" onPress={() => onChange((s) => addEstimate(s, { lines: [] }, mkId))} testID="estimate-add" hint="Starts a blank estimate beside this one" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 12, gap: 6, borderWidth: 2, borderColor: 'transparent' },
  cardOn: { borderColor: colors.border },
  cardOff: { opacity: 0.65 },
  top: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  name: { flex: 1, fontSize: type.body, fontWeight: '900', color: colors.text },
  amount: { fontSize: type.body, fontWeight: '900', color: colors.text },
  struck: { textDecorationLine: 'line-through' },
  signed: { fontSize: 15, fontWeight: '800', color: colors.text },
  meta: { fontSize: 15, fontWeight: '600', color: colors.muted },
  buttons: { gap: 6 },
  input: { minHeight: 48, borderRadius: 10, borderWidth: 3, borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.bg },
});
