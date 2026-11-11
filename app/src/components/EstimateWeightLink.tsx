import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, touch, type } from '../theme';

/** Opens the door weight estimate, for quoting before the door is weighed. */
export function EstimateWeightLink({ testID }: { testID?: string }) {
  return (
    <Pressable onPress={() => router.push('/door-weight')} accessibilityRole="button" testID={testID} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Text style={styles.text}>No scale yet? Estimate the weight</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  pressed: { backgroundColor: colors.safety },
  text: { fontSize: type.body, fontWeight: '800', color: colors.text },
});
