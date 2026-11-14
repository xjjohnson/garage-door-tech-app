import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { MeasureField, SectionTitle } from '../components/controls';
import { TIER_LABEL, TIERS } from '../lib/prices';
import { useFollowUps } from '../lib/useFollowUps';
import { QrCode } from '../components/QrCode';
import { Business, payLinks } from '../lib/invoices';
import { queueBusiness } from '../lib/settingsSync';
import { isOwner } from '../lib/scorecard';
import { useInvoices } from '../lib/useInvoices';
import { useOdoo } from '../lib/useOdoo';
import { colors, touch, type } from '../theme';

const FIELDS: { key: Exclude<keyof Business, 'discounts'>; label: string; placeholder: string; hint?: string; keyboard?: 'phone-pad' | 'email-address' | 'url' }[] = [
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
  {
    key: 'reviewUrl',
    label: 'Review link',
    placeholder: 'g.page/r/... or your Yelp page',
    hint: 'Your Google review link (Google Business Profile, "Ask for reviews"). Paid invoices get an Ask for a review button that texts it.',
    keyboard: 'url',
  },
];

/**
 * Business details for invoices and getting paid. Signed in to Odoo they are
 * the company's, shared by every phone: the owner (an Odoo admin or Field
 * Service manager) edits them and they are saved in Odoo as typed; everyone
 * else sees them. Not signed in, they are saved on this phone as typed.
 */
export function BusinessScreen() {
  const { business, setBusiness } = useInvoices();
  const { settings, setSettings } = useFollowUps();
  const num = (v: string, fallback: number) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  const { client, status } = useOdoo();
  const signedIn = status === 'signedIn' && !!client;
  const [owner, setOwner] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    setOwner(null);
    if (signedIn && client) isOwner(client).then((ok) => alive && setOwner(ok));
    return () => {
      alive = false;
    };
  }, [signedIn, client]);
  const locked = signedIn && owner !== true;
  const preview = payLinks(business, 0, '').filter((l) => l.url);
  return (
    <View style={styles.stack} testID="business">
      <Text style={styles.note} testID="business-where">
        {!signedIn ? 'Saved on this phone as you type, and included in backups.' : owner === true ? "Saved in Odoo on your company as you type. Every phone reads it from there." : owner === false ? 'These come from Odoo, set by the owner. Ask the owner to change them.' : 'Checking with Odoo...'}
      </Text>
      {FIELDS.map((f) => (
        <View key={f.key} style={styles.field}>
          <Text style={styles.label}>{f.label}</Text>
          {f.hint ? <Text style={styles.note}>{f.hint}</Text> : null}
          <TextInput
            value={business[f.key]}
            editable={!locked}
            onChangeText={(v) => {
              const next = { ...business, [f.key]: v };
              setBusiness(() => next);
              if (signedIn && owner === true) queueBusiness(next);
            }}
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
      {signedIn && owner === true ? (
        <Pressable onPress={() => queueBusiness(business)} accessibilityRole="button" testID="business-save-odoo" style={styles.save}>
          <Text style={styles.label}>Save these to Odoo now</Text>
        </Pressable>
      ) : null}
      <SectionTitle>Warranty lengths</SectionTitle>
      <Text style={styles.note}>The starting warranty on each job, saved on this phone: parts in years, labor in days. On an invoice you can pick that job&apos;s own warranty.</Text>
      {TIERS.map((tier) => (
        <MeasureField
          key={tier}
          label={`${TIER_LABEL[tier]} spring warranty`}
          value={String(settings.warrantyMonths[tier] / 12)}
          onChange={(v) => setSettings((s) => ({ ...s, warrantyMonths: { ...s.warrantyMonths, [tier]: num(v, s.warrantyMonths[tier] / 12) * 12 } }))}
          unit="years"
          allowFraction={false}
          allowDecimal={false}
          testID={`followup-warranty-${tier}`}
        />
      ))}
      <MeasureField label="Labor warranty" value={String(settings.laborWarrantyDays)} onChange={(v) => setSettings((s) => ({ ...s, laborWarrantyDays: num(v, s.laborWarrantyDays) }))} unit="days" allowFraction={false} allowDecimal={false} testID="followup-labor" />
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
  save: { minHeight: touch.min, borderRadius: 10, borderWidth: 3, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  qr: { alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: colors.border },
});
