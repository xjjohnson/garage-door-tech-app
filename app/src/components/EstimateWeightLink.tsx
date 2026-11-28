import { router } from 'expo-router';
import { Pressable } from 'react-native';
import { Text } from './AppText';
import { colors, touch, type, bw, rad, sp } from '../theme';
import { makeStyles } from '../lib/makeStyles';

/** Opens the door weight estimate, for quoting before the door is weighed. */
export function EstimateWeightLink({ testID }: { testID?: string }) {
  const styles = useStyles();
  return (
    <Pressable onPress={() => router.push('/door-weight')} accessibilityRole="button" testID={testID} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Text style={styles.text}>No scale yet? Estimate the weight</Text>
    </Pressable>
  );
}

const useStyles = makeStyles(() => ({
  button: { minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: sp(12) },
  pressed: { backgroundColor: colors.info },
  text: { fontSize: type.body, fontWeight: '800', color: colors.text },
}));
