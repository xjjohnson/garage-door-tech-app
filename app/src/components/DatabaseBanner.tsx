/**
 * A colored strip across the top of every screen while the phone is attached
 * to a database that isn't the one marked live, so a test copy can't be
 * mistaken for the real business. Shows nothing on the live database.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from './AppText';
import { dbLabel, isNotLive, liveId } from '../lib/dbSwitch';
import { useOdooIfAny } from '../lib/useOdoo';
import { colors, fs, sp } from '../theme';
import { makeStyles } from '../lib/makeStyles';

export function DatabaseBanner() {
  const styles = useStyles();
  const odoo = useOdooIfAny();
  const saved = odoo?.saved ?? null;
  const [live, setLive] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    liveId(AsyncStorage).then((l) => alive && setLive(l));
    return () => {
      alive = false;
    };
  }, [saved?.db, saved?.url]);
  if (!saved || !isNotLive(live, saved)) return null;
  return (
    <View pointerEvents="none" style={styles.wrap} testID="database-banner" accessibilityRole="alert">
      <Text style={styles.text}>{`NOT LIVE · ${dbLabel(saved)}`}</Text>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.warn, paddingVertical: sp(3), alignItems: 'center' },
  text: { color: '#FFFFFF', fontSize: fs(13), fontWeight: '800' },
}));
