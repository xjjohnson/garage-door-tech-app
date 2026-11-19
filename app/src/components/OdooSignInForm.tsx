import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TextInput } from './AppText';
import { Action } from './Buttons';
import { cleanUrl, guessDb } from '../lib/odoo';
import { useOdoo } from '../lib/useOdoo';
import { colors, touch, type, bw, fs, rad } from '../theme';

/**
 * The Odoo sign-in form (address, database, email, API key). One copy, used
 * by the Team page for first-time sign-in and by the Developer screen's
 * account section for signing in again.
 */
export function OdooSignInForm({ intro = true, testID = 'team-signin' }: { intro?: boolean; testID?: string }) {
  const { saved, signIn, status, error } = useOdoo();
  const [url, setUrl] = useState(saved?.url ?? '');
  const [db, setDb] = useState(saved?.db ?? '');
  const [login, setLogin] = useState(saved?.login ?? '');
  const [secret, setSecret] = useState('');
  const busy = status === 'signingIn';
  return (
    <View style={styles.stack} testID={testID}>
      {intro ? <Text style={styles.note}>Sign in with your Odoo account to get the jobs assigned to you, and to give jobs to your techs. Each tech signs in with their own Odoo user.</Text> : null}
      <Field
        label="Odoo address"
        value={url}
        onChange={(v) => {
          setUrl(v);
          if (!db) setDb(guessDb(v));
        }}
        placeholder="yourcompany.odoo.com"
        keyboard="url"
        testID="team-url"
      />
      <Field label="Database" hint="For yourcompany.odoo.com it's usually yourcompany. To test against a copy, put the copy's database name here." value={db} onChange={setDb} placeholder="yourcompany" testID="team-db" />
      <Field label="Email" value={login} onChange={setLogin} placeholder="you@yourcompany.com" keyboard="email-address" testID="team-login" />
      <Field
        label="API key (or password)"
        hint="Use an API key: in Odoo, your name > My Preferences > Account Security > New API Key. It's kept in the phone's keystore."
        value={secret}
        onChange={setSecret}
        placeholder="API key"
        secure
        testID="team-secret"
      />
      {error ? (
        <Text style={styles.error} testID="team-error">
          {error}
        </Text>
      ) : null}
      <Action label={busy ? 'Signing in...' : 'Sign in to Odoo'} primary disabled={busy} onPress={() => signIn({ url: cleanUrl(url), db, login }, secret)} testID="team-signin-go" />
    </View>
  );
}

function Field({ label, hint, value, onChange, placeholder, keyboard, secure, testID }: { label: string; hint?: string; value: string; onChange: (v: string) => void; placeholder: string; keyboard?: 'url' | 'email-address'; secure?: boolean; testID: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.meta}>{hint}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboard ?? 'default'}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={secure}
        accessibilityLabel={label}
        testID={testID}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  field: { gap: 4 },
  label: { fontSize: type.label, fontWeight: '800', color: colors.text },
  meta: { fontSize: fs(16), fontWeight: '600', color: colors.muted },
  note: { fontSize: fs(16), color: colors.muted, lineHeight: 22 },
  error: { fontSize: type.body, fontWeight: '800', color: colors.stop },
  input: { minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.card },
});
