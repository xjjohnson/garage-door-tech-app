/**
 * Address autofill under an address field: map results and houses in Odoo
 * (not other saved customers) while the field is focused and being typed in.
 * Tapping one fills the field and hides the list until it's typed in again.
 * New job has its own list, which also offers saved customers.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AddressSuggestion } from '../lib/addressSuggest';
import { useAddressSuggestions } from '../lib/useAddressSuggestions';
import { rememberPoint } from '../lib/useGeocode';
import { colors, touch } from '../theme';

export function AddressSuggestions({
  typed,
  focused,
  reset,
  onPick,
  testID,
}: {
  /** What's in the field now. */
  typed: string;
  /** Whether the field has focus. */
  focused: boolean;
  /** Changes when the form opens afresh: what's in the field then isn't asked about. */
  reset?: unknown;
  onPick: (a: AddressSuggestion) => void;
  /** Rows get `${testID}-0`, `${testID}-1`... */
  testID: string;
}) {
  // The text last filled in or opened with: no suggestions for it.
  const [settled, setSettled] = useState(typed);
  useEffect(() => {
    setSettled(typed);
    // Only when the form opens afresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reset]);
  const places = useAddressSuggestions(typed, !focused || typed === settled).filter((a) => !a.customerId);
  if (places.length === 0) return null;
  return (
    <View>
      {places.map((a, i) => (
        <Pressable
          key={`${a.addressId ?? 'map'}-${a.address}`}
          onPress={() => {
            if (a.point) rememberPoint(a.address, a.point);
            setSettled(a.address);
            onPick(a);
          }}
          accessibilityRole="button"
          testID={`${testID}-${i}`}
          style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
        >
          <Text style={styles.name}>{a.street || a.address}</Text>
          <Text style={styles.sub}>{a.addressId ? `${a.address} · House in Odoo` : [a.city, a.zip].filter(Boolean).join(' ')}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  suggestion: { minHeight: touch.min, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: colors.info, paddingVertical: 6 },
  name: { fontSize: 17, fontWeight: '800', color: colors.text },
  sub: { fontSize: 15, fontWeight: '600', color: colors.muted },
  pressed: { backgroundColor: colors.safety },
});
