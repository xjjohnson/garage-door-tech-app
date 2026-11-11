import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SectionTitle } from '../components/controls';
import { QrCode } from '../components/QrCode';
import { Business, payLinks } from '../lib/invoices';
import { useInvoices } from '../lib/useInvoices';
import { colors, touch, type } from '../theme';

const FIELDS: { key: keyof Business; label: string; placeholder: string; hint?: string; keyboard?: 'phone-pad' | 'email-address' }[] = [
  { key: 'name', label: 'Business name', placeholder: 'Shown at the top of invoices' },
  { key: 'phone', label: 'Business phone', placeholder: 'For questions about an invoice', keyboard: 'phone-pad' },
  { key: 'cashtag', label: 'Cash App $cashtag', placeholder: '$yourcashtag', hint: 'Invoices show a QR code that opens Cash App with the amount filled in.' },
  { key: 'venmo', label: 'Venmo username', placeholder: '@your-username', hint: 'Invoices show a QR code that opens Venmo with the amount and invoice number filled in.' },
  {
    key: 'zelle',
    label: 'Zelle email or phone',
    placeholder: 'The one your bank uses for Zelle',
    hint: "Zelle has no link that fills in the amount, so invoices show this to send to.",
    keyboard: 'email-address',
  },
];

/** The tech's own details for invoices and getting paid. Saved on the phone as typed. */
export function BusinessScreen() {
  const { business, setBusiness } = useInvoices();
  const preview = payLinks(business, 0, '').filter((l) => l.url);
  return (
    <View style={styles.stack} testID="business">
      <Text style={styles.note}>Saved on this phone as you type, and included in backups.</Text>
      {FIELDS.map((f) => (
        <View key={f.key} style={styles.field}>
          <Text style={styles.label}>{f.label}</Text>
          {f.hint ? <Text style={styles.note}>{f.hint}</Text> : null}
          <TextInput
            value={business[f.key]}
            onChangeText={(v) => setBusiness((b) => ({ ...b, [f.key]: v }))}
            placeholder={f.placeholder}
            placeholderTextColor={colors.muted}
            keyboardType={f.keyboard ?? 'default'}
            autoCapitalize={f.key === 'name' ? 'words' : 'none'}
            autoCorrect={false}
            accessibilityLabel={f.label}
            testID={`business-${f.key}`}
            style={styles.input}
          />
        </View>
      ))}
      {preview.length > 0 ? (
        <>
          <SectionTitle>Check your codes</SectionTitle>
          <Text style={styles.note}>Scan these with your own phone to be sure they open your account. On an invoice they also fill in the amount.</Text>
          {preview.map((l) => (
            <View key={l.method} style={styles.qr} testID={`business-qr-${l.method}`}>
              <QrCode value={l.url!} size={200} />
              <Text style={styles.label}>
                {l.label} {l.handle}
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  field: { gap: 4 },
  label: { fontSize: type.label, fontWeight: '800', color: colors.text },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  input: {
    minHeight: touch.min,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: type.body,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.bg,
  },
  qr: { alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: colors.border },
});
