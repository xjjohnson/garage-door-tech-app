import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../components/AppText';
import { Action } from '../components/Buttons';
import { OdooSignInForm } from '../components/OdooSignInForm';
import { currentFlavor } from '../flavor';
import { isOwner } from '../lib/scorecard';
import { useOdoo } from '../lib/useOdoo';
import { IndustryTab } from './IndustryTab';
import { SetupCheckScreen } from './SetupCheckScreen';
import { colors, type, fs, sp } from '../theme';
import { makeStyles } from '../lib/makeStyles';

/**
 * What a phone with no Odoo database shows on first start: sign in, test the
 * connection and apps, and (for the owner) pick the industry. "Skip" goes to
 * the normal app, where nothing is lost.
 */
export function FirstRunSetup({ onDone }: { onDone: () => void }) {
  const styles = useStyles();
  const { client, status } = useOdoo();
  const signedIn = status === 'signedIn' && !!client;
  const [owner, setOwner] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    setOwner(null);
    if (signedIn && client) isOwner(client).then((ok) => alive && setOwner(ok)).catch(() => alive && setOwner(false));
    return () => {
      alive = false;
    };
  }, [signedIn, client]);
  return (
    <SafeAreaView style={styles.root} testID="first-run-setup">
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>Welcome to {currentFlavor().appName}</Text>
        <Text style={styles.note}>Connect to your Odoo to get started. Your jobs, customers and settings all live there.</Text>
        {!signedIn ? (
          <>
            <Text style={styles.step}>1. Sign in</Text>
            <OdooSignInForm intro={false} testID="first-run-signin" />
          </>
        ) : (
          <>
            <Text style={styles.step}>1. Signed in</Text>
            <Text style={styles.note}>Connected as {client!.session.name || client!.session.login}.</Text>
            <Text style={styles.step}>2. Test the connection and apps</Text>
            <SetupCheckScreen />
            {owner ? (
              <>
                <Text style={styles.step}>3. Pick your industry</Text>
                <IndustryTab client={client!} canEdit />
              </>
            ) : null}
          </>
        )}
        <Action label={signedIn ? 'Continue' : 'Skip for now'} primary={signedIn} onPress={onDone} testID={signedIn ? 'first-run-continue' : 'first-run-skip'} />
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(() => ({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: sp(20), gap: sp(14) },
  title: { fontSize: type.big, fontWeight: '800', color: colors.text },
  note: { fontSize: fs(16), color: colors.muted, lineHeight: fs(22) },
  step: { fontSize: type.body, fontWeight: '800', color: colors.text, marginTop: sp(6) },
}));
