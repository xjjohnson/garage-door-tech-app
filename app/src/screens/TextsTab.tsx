import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { fillText, TEXT_DEFAULT, TEXT_FIELD, TEXT_LABEL, TEXT_WORDS, TextKind, wording } from '../lib/messageTexts';
import { reviewLink } from '../lib/invoices';
import { queueBusiness } from '../lib/settingsSync';
import { useInvoices } from '../lib/useInvoices';
import { colors, touch, type } from '../theme';

const KINDS: TextKind[] = ['onMyWay', 'eta', 'review'];

/**
 * Management > Texts: the wording of the pre-written texts. They only fill in
 * the phone's texting app; the tech reads and taps Send. Saved with the
 * company's business details in Odoo, so every phone uses the same words.
 */
export function TextsTab({ canEdit }: { canEdit: boolean }) {
  const { business, setBusiness } = useInvoices();
  const [saved, setSaved] = useState(false);
  const change = (kind: TextKind, value: string) => {
    const next = { ...business, [TEXT_FIELD[kind]]: value };
    setBusiness(() => next);
    setSaved(false);
  };
  const sample = (kind: TextKind) => fillText(wording(business, kind), { name: 'Maria Lopez', business: business.name, minutes: 20, reviewLink: reviewLink(business) || 'https://g.page/r/your-review-link' });
  return (
    <View style={styles.stack} testID="manage-texts">
      <Text style={styles.note}>These open your texting app with the words filled in. Nothing is ever sent for you. Leave one blank to use the standard wording.</Text>
      <Text style={styles.note} testID="manage-texts-words">Words that fill in: {TEXT_WORDS.join('  ')}</Text>
      {KINDS.map((k) => (
        <View key={k} style={styles.field}>
          <Text style={styles.label}>{TEXT_LABEL[k]}</Text>
          <TextInput
            value={business[TEXT_FIELD[k]]}
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

const styles = StyleSheet.create({
  stack: { gap: 12 },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  field: { gap: 6 },
  label: { fontSize: type.label, fontWeight: '800', color: colors.text },
  input: { minHeight: 120, borderRadius: 10, borderWidth: 3, borderColor: colors.border, paddingHorizontal: 14, paddingTop: 12, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.bg, textAlignVertical: 'top' },
  meta: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  back: { minHeight: touch.min, borderRadius: 10, borderWidth: 3, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primary: { minHeight: touch.min, borderRadius: 10, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { fontSize: type.body, fontWeight: '800', color: colors.onSelected },
});
