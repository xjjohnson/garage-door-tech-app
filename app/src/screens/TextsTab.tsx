import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { fillText, TEXT_DEFAULT, TEXT_FIELD, TEXT_LABEL, TEXT_WORDS, TextKind, wording } from '../lib/messageTexts';
import { reviewLink } from '../lib/invoices';
import { DEFAULT_PAYMENTS_HEADING, DEFAULT_PLAN_HEADING } from '../lib/ticketSections';
import { queueBusiness } from '../lib/settingsSync';
import { useInvoices } from '../lib/useInvoices';
import { colors, touch, type, bw, fs, rad, sp, sz } from '../theme';
import { makeStyles } from '../lib/makeStyles';

const KINDS: TextKind[] = ['onMyWay', 'eta', 'confirm', 'review'];

const HEADINGS = [
  { field: 'planHeading', label: 'Heading above the plan fee', fallback: DEFAULT_PLAN_HEADING },
  { field: 'paymentsHeading', label: 'Heading above deposits and the plan note', fallback: DEFAULT_PAYMENTS_HEADING },
] as const;

/**
 * Management > Texts: the wording of the pre-written texts. They only fill in
 * the phone's texting app; the tech reads and taps Send. Saved with the
 * company's business details in Odoo, so every phone uses the same words.
 */
export function TextsTab({ canEdit }: { canEdit: boolean }) {
  const styles = useStyles();
  const { business, setBusiness } = useInvoices();
  const [saved, setSaved] = useState(false);
  const change = (kind: TextKind, value: string) => {
    const next = { ...business, [TEXT_FIELD[kind]]: value };
    setBusiness(() => next);
    setSaved(false);
  };
  const sample = (kind: TextKind) => fillText(wording(business, kind), { name: 'Maria Lopez', business: business.name, minutes: 20, day: 'tomorrow', window: 'between 9:00 am and 12:00 pm', reviewLink: reviewLink(business) || 'https://g.page/r/your-review-link' });
  return (
    <View style={styles.stack} testID="manage-texts">
      <Text style={styles.note}>These open your texting app with the words filled in. Nothing is ever sent for you. Leave one blank to use the standard wording.</Text>
      <Text style={styles.note} testID="manage-texts-words">Words that fill in: {TEXT_WORDS.join('  ')}</Text>
      {KINDS.map((k) => (
        <View key={k} style={styles.field}>
          <Text style={styles.label}>{TEXT_LABEL[k]}</Text>
          <TextInput
            value={business[TEXT_FIELD[k]] ?? ''}
            onChangeText={(v) => change(k, v)}
            editable={canEdit}
            multiline
            placeholder={TEXT_DEFAULT[k]}
            placeholderTextColor={colors.muted}
            accessibilityLabel={TEXT_LABEL[k]}
            testID={`manage-text-${k}`}
            style={styles.input}
          />
          <Text style={styles.meta} testID={`manage-text-preview-${k}`}>Looks like: {sample(k)}</Text>
          {canEdit && business[TEXT_FIELD[k]] ? (
            <Pressable onPress={() => change(k, '')} accessibilityRole="button" testID={`manage-text-reset-${k}`} style={styles.back}>
              <Text style={styles.buttonText}>Use the standard wording</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      <Text style={styles.label}>Ticket headings</Text>
      <Text style={styles.note}>On a ticket with sections, these two headings are added on their own: one above the maintenance plan fee, one above the deposit and plan notes at the bottom. Leave one blank to use the standard wording.</Text>
      {HEADINGS.map((h) => (
        <View key={h.field} style={styles.field}>
          <Text style={styles.label}>{h.label}</Text>
          <TextInput
            value={business[h.field] ?? ''}
            onChangeText={(v) => {
              setBusiness(() => ({ ...business, [h.field]: v }));
              setSaved(false);
            }}
            editable={canEdit}
            placeholder={h.fallback}
            placeholderTextColor={colors.muted}
            accessibilityLabel={h.label}
            testID={`manage-heading-${h.field}`}
            style={styles.line}
          />
        </View>
      ))}
      {canEdit ? (
        <Pressable
          onPress={() => {
            queueBusiness(business);
            setSaved(true);
          }}
          accessibilityRole="button"
          testID="manage-texts-save"
          style={styles.primary}
        >
          <Text style={styles.primaryText}>Save to Odoo</Text>
        </Pressable>
      ) : (
        <Text style={styles.note}>Only the owner can change the wording.</Text>
      )}
      {saved ? (
        <Text style={styles.note} testID="manage-texts-msg" accessibilityLiveRegion="polite">
          Saved. Every phone picks it up from Odoo.
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: sp(12) },
  note: { fontSize: fs(16), color: colors.muted, lineHeight: fs(22) },
  field: { gap: sp(6) },
  label: { fontSize: type.label, fontWeight: '800', color: colors.text },
  input: { minHeight: sz(120), borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, paddingHorizontal: sp(14), paddingTop: sp(12), fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.card, textAlignVertical: 'top' },
  line: { minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, paddingHorizontal: sp(14), fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.card },
  meta: { fontSize: fs(16), color: colors.muted, lineHeight: fs(22) },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  back: { minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: sp(16) },
  primary: { minHeight: touch.min, borderRadius: rad(14), backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center', paddingHorizontal: sp(16) },
  primaryText: { fontSize: type.body, fontWeight: '800', color: colors.onSelected },
}));
