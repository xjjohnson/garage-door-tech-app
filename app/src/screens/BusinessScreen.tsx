import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { SectionTitle, Segmented } from '../components/controls';
import { loadCompanyBrand } from '../lib/companyBrand';
import { LOGO_DATA_URL } from '../data/logoPng';
import { QrCode } from '../components/QrCode';
import { Business, payLinks } from '../lib/invoices';
import { queueBusiness } from '../lib/settingsSync';
import { isOwner } from '../lib/scorecard';
import { useInvoices } from '../lib/useInvoices';
import { useOdoo } from '../lib/useOdoo';
import { colors, touch, type, bw, fs, rad } from '../theme';

const FIELDS: { key: Exclude<keyof Business, 'discounts' | 'customerTypes' | 'useOdooLogo'>; label: string; placeholder: string; hint?: string; keyboard?: 'phone-pad' | 'email-address' | 'url' }[] = [
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
  const [odooLogo, setOdooLogo] = useState('');
  useEffect(() => {
    loadCompanyBrand().then((b) => setOdooLogo(b.logo));
  }, [signedIn]);
  const locked = signedIn && owner !== true;
  const useLogo = business.useOdooLogo === true;
  const setUseLogo = (on: boolean) => {
    const next = { ...business, useOdooLogo: on || undefined };
    setBusiness(() => next);
    if (signedIn && owner === true) queueBusiness(next);
  };
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
      <SectionTitle>Logo</SectionTitle>
      <Text style={styles.note}>Show your company logo from Odoo on PDFs (inspection and photo reports) instead of the built-in Johnsons logo. If Odoo has no usable logo, the built-in one is used.</Text>
      {locked ? null : (
        <Segmented<'odoo' | 'built-in'>
          testID="business-logo-switch"
          options={[{ value: 'built-in', label: 'Built-in logo' }, { value: 'odoo', label: 'Logo from Odoo' }]}
          value={useLogo ? 'odoo' : 'built-in'}
          onChange={(v) => setUseLogo(v === 'odoo')}
        />
      )}
      <Image source={{ uri: useLogo && odooLogo ? odooLogo : LOGO_DATA_URL }} resizeMode="contain" style={styles.logo} accessibilityLabel="Logo on reports" testID="business-logo-preview" />
      {useLogo && !odooLogo ? <Text style={styles.note} testID="business-logo-none">The phone has no logo from Odoo yet, or it is too large. It is fetched while you are signed in, within about 15 minutes. Until then the built-in logo is used.</Text> : null}
      {signedIn && owner === true ? (
        <Pressable onPress={() => queueBusiness(business)} accessibilityRole="button" testID="business-save-odoo" style={styles.save}>
          <Text style={styles.label}>Save these to Odoo now</Text>
        </Pressable>
      ) : null}
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
  logo: { height: 64, width: '100%', alignSelf: 'flex-start' },
  field: { gap: 4 },
  label: { fontSize: type.label, fontWeight: '800', color: colors.text },
  note: { fontSize: fs(16), color: colors.muted, lineHeight: 22 },
  input: {
    minHeight: touch.min,
    borderRadius: rad(10),
    borderWidth: bw(1.5),
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: type.body,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.bg,
  },
  save: { minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  qr: { alignItems: 'center', gap: 8, padding: 12, borderRadius: rad(12), borderWidth: bw(1.5), borderColor: colors.border },
});
