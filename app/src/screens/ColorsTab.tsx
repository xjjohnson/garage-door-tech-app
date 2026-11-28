import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Updates from 'expo-updates';
import { Text } from '../components/AppText';
import { Segmented } from '../components/controls';
import { writePalette } from '../lib/industry';
import { loadLook } from '../lib/lookPref';
import type { OdooClient } from '../lib/odoo';
import { PALETTES, type Palette } from '../lib/themeLook';
import { makeStyles } from '../lib/makeStyles';
import { colors, look as drawnLook, touch, type, bw, fs, rad, sp } from '../theme';

/**
 * Management > Colors: the app's color for the whole company. Saved in Odoo so
 * every phone agrees; a phone repaints on its next start.
 */
export function ColorsTab({ client, canEdit, restart = () => Updates.reloadAsync() }: { client: OdooClient; canEdit: boolean; restart?: () => Promise<unknown> }) {
  const styles = useStyles();
  const [palette, setPalette] = useState<Palette>(drawnLook.palette);
  const [msg, setMsg] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    loadLook().then((l) => setPalette(l.palette));
  }, []);
  const pick = async (next: Palette) => {
    if (!canEdit) return;
    setPalette(next);
    try {
      await writePalette(client, next);
      setMsg('Saved. Every phone picks it up from Odoo.');
    } catch {
      setMsg('Odoo did not take the change. Nothing was saved.');
    }
  };
  const changed = palette !== drawnLook.palette;
  return (
    <View style={styles.stack} testID="manage-colors">
      <Text style={styles.note}>Pick the app's color for your whole company. Company brand uses the color set on your company in Odoo.</Text>
      <Segmented<Palette> testID="settings-look-palette" options={PALETTES} value={palette} onChange={pick} />
      {!canEdit ? <Text style={styles.note}>Only the owner can change this.</Text> : null}
      {msg ? <Text style={styles.note} testID="colors-msg">{msg}</Text> : null}
      {changed ? (
        <Pressable onPress={() => restart().catch(() => setFailed(true))} accessibilityRole="button" testID="settings-look-restart" style={styles.btn}>
          <Text style={styles.btnText}>Restart to use this color</Text>
        </Pressable>
      ) : null}
      {failed ? <Text style={styles.note}>Couldn't restart. Close and reopen the app to use it.</Text> : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: sp(12) },
  note: { fontSize: fs(16), color: colors.muted, lineHeight: fs(22) },
  btn: { minHeight: touch.min, borderRadius: rad(14), backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center', padding: sp(14) },
  btnText: { fontSize: type.body, fontWeight: '800', color: '#fff' },
}));
