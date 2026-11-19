import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { SectionTitle, Segmented } from '../components/controls';
import { loadCompanyBrand } from '../lib/companyBrand';
import { CompanyProfile, ProfileKey, htmlToText, readProfile, writeProfile } from '../lib/odooCompany';
import { TermsPage } from './OfficeExtras';
import { LOGO_DATA_URL } from '../data/logoPng';
import { QrCode } from '../components/QrCode';
import { Business, payLinks } from '../lib/invoices';
import { queueBusiness } from '../lib/settingsSync';
import { isOwner } from '../lib/scorecard';
import { useInvoices } from '../lib/useInvoices';
import { useOdoo } from '../lib/useOdoo';
import { colors, touch, type, bw, fs, rad, sp } from '../theme';

const FIELDS: { key: 'cashtag' | 'venmo' | 'zelle' | 'reviewUrl'; label: string; placeholder: string; hint?: string; keyboard?: 'phone-pad' | 'email-address' | 'url' }[] = [
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

/** Odoo company fields the owner edits here, grouped as the screen shows them. */
const PROFILE_FIELDS: Record<'identity' | 'contact' | 'documents', { key: ProfileKey; label: string; placeholder: string; hint?: string; keyboard?: 'phone-pad' | 'email-address' | 'url' | 'number-pad'; multiline?: boolean }[]> = {
  identity: [
    { key: 'name', label: 'Business name', placeholder: 'Shown at the top of invoices' },
    { key: 'vat', label: 'Tax ID', placeholder: 'Your tax ID number' },
    { key: 'company_registry', label: 'Company registration number', placeholder: 'If you have one' },
    { key: 'report_header', label: 'Tagline on documents', placeholder: 'A short line under your name' },
  ],
  contact: [
    { key: 'phone', label: 'Business phone', placeholder: '(555) 123-4567', hint: 'Customers call this number about a quote or invoice.', keyboard: 'phone-pad' },
    { key: 'email', label: 'Business email', placeholder: 'name@yourbusiness.com', keyboard: 'email-address' },
    { key: 'website', label: 'Website', placeholder: 'https://', keyboard: 'url' },
    { key: 'street', label: 'Street address', placeholder: 'Street and number' },
    { key: 'street2', label: 'Street address 2', placeholder: 'Suite, unit (optional)' },
    { key: 'city', label: 'City', placeholder: 'City' },
    { key: 'zip', label: 'ZIP code', placeholder: 'ZIP code' },
  ],
  documents: [
    { key: 'report_footer', label: 'Footer on every document', placeholder: 'For example your phone, website and license number', hint: 'Odoo prints this at the bottom of quotes and invoices.', multiline: true },
    { key: 'quotation_validity_days', label: 'Quotes are good for (days)', placeholder: '30', keyboard: 'number-pad' },
  ],
};

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

  // The company's real Odoo fields. Odoo wins: its name and phone replace the phone's copy, never the other way round.
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [profileErr, setProfileErr] = useState('');
  const [saved, setSaved] = useState('');
  useEffect(() => {
    let alive = true;
    setProfile(null);
    setProfileErr('');
    if (signedIn && client)
      readProfile(client).then(
        (p) => {
          if (!alive) return;
          setProfile(p);
          const { name, phone } = p.values;
          if ((name && name !== business.name) || (phone && phone !== business.phone)) setBusiness((b) => ({ ...b, name: name || b.name, phone: phone || b.phone }));
        },
        (e) => alive && setProfileErr(e instanceof Error ? e.message : String(e)),
      );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, client]);
  const timers = useRef<Partial<Record<ProfileKey, ReturnType<typeof setTimeout>>>>({});
  useEffect(() => () => Object.values(timers.current).forEach((t) => t && clearTimeout(t)), []);
  const edit = useCallback(
    (key: ProfileKey, v: string) => {
      setProfile((p) => (p ? { ...p, values: { ...p.values, [key]: v } } : p));
      if (key === 'name' || key === 'phone') {
        const next = { ...business, [key]: v };
        setBusiness(() => next);
        queueBusiness(next);
      }
      const old = timers.current[key];
      if (old) clearTimeout(old);
      setSaved('');
      timers.current[key] = setTimeout(() => {
        if (!client) return;
        // Rich-text fields: leave Odoo's own formatting alone unless the words changed.
        const raw = profile?.rawHtml?.[key];
        if (raw !== undefined && htmlToText(raw) === v.trim()) return;
        writeProfile(client, { [key]: v }).then(
          () => setSaved('Saved to Odoo.'),
          (e) => setSaved(e instanceof Error ? e.message : 'Odoo did not save that.'),
        );
      }, 700);
    },
    [business, client, setBusiness, profile],
  );

  const locked = signedIn && owner !== true;
  const odooFields = signedIn && !!profile;
  const useLogo = business.useOdooLogo === true;
  const setUseLogo = (on: boolean) => {
    const next = { ...business, useOdooLogo: on || undefined };
    setBusiness(() => next);
    if (signedIn && owner === true) queueBusiness(next);
  };
  const preview = payLinks(business, 0, '').filter((l) => l.url);

  /** One text box: an Odoo company field when signed in, the phone's own copy of name and phone when not. */
  const profileBox = (f: (typeof PROFILE_FIELDS)['identity'][number]) => {
    if (odooFields) {
      if (!profile!.has[f.key]) return null;
      return (
        <Box key={f.key} label={f.label} hint={f.hint} value={profile!.values[f.key]} editable={!locked} onChange={(v) => edit(f.key, v)} placeholder={f.placeholder} keyboard={f.keyboard} caps={f.key === 'name'} testID={`business-${f.key}`} />
      );
    }
    if (f.key !== 'name' && f.key !== 'phone') return null;
    return (
      <Box
        key={f.key}
        label={f.label}
        value={business[f.key]}
        editable={!locked}
        onChange={(v) => {
          const next = { ...business, [f.key]: v };
          setBusiness(() => next);
          if (signedIn && owner === true) queueBusiness(next);
        }}
        placeholder={f.placeholder}
        keyboard={f.keyboard}
        caps={f.key === 'name'}
        testID={`business-${f.key}`}
      />
    );
  };
  const readOnly = (label: string, value: string, id: string) =>
    value ? (
      <View style={styles.field} key={id}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.note} testID={`business-${id}`}>{value}</Text>
      </View>
    ) : null;

  return (
    <View style={styles.stack} testID="business">
      <Text style={styles.note} testID="business-where">
        {!signedIn ? 'Saved on this phone as you type, and included in backups.' : owner === true ? 'Saved in Odoo on your company as you type. Odoo prints the same details on its own quotes and invoices, and every phone reads them from there.' : owner === false ? 'These come from Odoo, set by the owner. Ask the owner to change them.' : 'Checking with Odoo...'}
      </Text>
      {profileErr ? <Text style={styles.note} testID="business-profile-error">Could not read your company from Odoo: {profileErr}</Text> : null}
      {saved ? <Text style={styles.note} testID="business-saved">{saved}</Text> : null}

      <SectionTitle first>Identity</SectionTitle>
      {PROFILE_FIELDS.identity.map(profileBox)}

      <SectionTitle>Contact</SectionTitle>
      {PROFILE_FIELDS.contact.map(profileBox)}
      {odooFields ? readOnly('State and country', [profile!.state, profile!.country].filter(Boolean).join(', '), 'region') : null}
      {FIELDS.filter((f) => f.key === 'reviewUrl').map((f) => (
        <Box
          key={f.key}
          label={f.label}
          hint={f.hint}
          value={business[f.key]}
          editable={!locked}
          onChange={(v) => {
            const next = { ...business, [f.key]: v };
            setBusiness(() => next);
            if (signedIn && owner === true) queueBusiness(next);
          }}
          placeholder={f.placeholder}
          keyboard={f.keyboard}
          testID={`business-${f.key}`}
        />
      ))}

      <SectionTitle>Payments</SectionTitle>
      <Text style={styles.note}>We take check, Cash App, Venmo, Zelle and cash. No card payments.</Text>
      {FIELDS.filter((f) => f.key !== 'reviewUrl').map((f) => (
        <Box
          key={f.key}
          label={f.label}
          hint={f.hint}
          value={business[f.key]}
          editable={!locked}
          onChange={(v) => {
            const next = { ...business, [f.key]: v };
            setBusiness(() => next);
            if (signedIn && owner === true) queueBusiness(next);
          }}
          placeholder={f.placeholder}
          keyboard={f.keyboard}
          testID={`business-${f.key}`}
        />
      ))}
      {preview.length > 0 ? (
        <>
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
      {signedIn && owner === true ? (
        <Pressable onPress={() => queueBusiness(business)} accessibilityRole="button" testID="business-save-odoo" style={styles.save}>
          <Text style={styles.label}>Save payment details to Odoo now</Text>
        </Pressable>
      ) : null}

      {odooFields ? (
        <>
          <SectionTitle>Documents</SectionTitle>
          {PROFILE_FIELDS.documents.map(profileBox)}
          {readOnly('Sales tax', profile!.salesTax ? `${profile!.salesTax}. Odoo applies it, on parts only.` : '', 'tax')}
          {readOnly('Currency', profile!.currency, 'currency')}
          {owner === true && client ? (
            <>
              <Text style={styles.label}>Terms and Conditions on quotes</Text>
              <TermsPage client={client} />
            </>
          ) : null}
        </>
      ) : null}

      <SectionTitle>Branding</SectionTitle>
      <Text style={styles.note}>Show your company logo from Odoo on PDFs (inspection and photo reports) instead of the built-in Johnsons logo. If Odoo has no usable logo, the built-in one is used. Change the logo itself in Odoo.</Text>
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
    </View>
  );
}

function Box({ label, hint, value, editable, onChange, placeholder, keyboard, caps, testID }: { label: string; hint?: string; value: string; editable: boolean; onChange: (v: string) => void; placeholder: string; keyboard?: string; caps?: boolean; testID: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.note}>{hint}</Text> : null}
      <TextInput
        value={value}
        editable={editable}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={(keyboard as 'default') ?? 'default'}
        autoCapitalize={caps ? 'words' : 'none'}
        autoCorrect={false}
        accessibilityLabel={label}
        testID={testID}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: sp(14) },
  logo: { height: 64, width: '100%', alignSelf: 'flex-start' },
  field: { gap: sp(4) },
  label: { fontSize: type.label, fontWeight: '800', color: colors.text },
  note: { fontSize: fs(16), color: colors.muted, lineHeight: fs(22) },
  input: {
    minHeight: touch.min,
    borderRadius: rad(10),
    borderWidth: bw(1.5),
    borderColor: colors.border,
    paddingHorizontal: sp(14),
    fontSize: type.body,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.bg,
  },
  save: { minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  qr: { alignItems: 'center', gap: sp(8), padding: sp(12), borderRadius: rad(12), borderWidth: bw(1.5), borderColor: colors.border },
});
