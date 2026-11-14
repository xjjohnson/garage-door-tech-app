/**
 * Picks which of a customer's addresses a ticket, quote or invoice is for:
 * their main address or one of the addresses under their Odoo contact (the
 * house, when a property manager is the customer). Its value is the Odoo
 * contact id to use as the delivery address (partner_shipping_id): the
 * customer's own id for the main address.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { addressLine, typeLabel } from '../lib/odooContacts';
import { useContactAddresses } from '../lib/useContactAddresses';
import { colors, touch, type } from '../theme';

export function AddressPicker({
  partnerId,
  mainAddress,
  value,
  onChange,
  testID = 'address-picker',
}: {
  /** The customer's Odoo contact. */
  partnerId: number;
  /** The customer's own address, shown as the first choice. */
  mainAddress: string;
  /** The chosen Odoo contact id; the customer's own when nothing else is picked. */
  value?: number;
  onChange: (partnerId: number, address: string) => void;
  testID?: string;
}) {
  const { addresses } = useContactAddresses(partnerId);
  const houses = addresses.filter((a) => a.type === 'delivery' || a.type === 'other');
  const chosen = value ?? partnerId;
  const options = [{ id: partnerId, title: 'Main address', line: mainAddress || 'No address' }, ...houses.map((a) => ({ id: a.id, title: typeLabel(a.type), line: addressLine(a) }))];
  if (options.length === 1) return null;
  return (
    <View style={styles.stack} testID={testID} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.id === chosen;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id, o.id === partnerId ? mainAddress : houses.find((a) => a.id === o.id)?.address ?? '')}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            testID={`${testID}-${o.id}`}
            style={({ pressed }) => [styles.option, on && styles.on, pressed && styles.pressed]}
          >
            <Text style={[styles.title, on && styles.onText]}>{o.title}</Text>
            <Text style={[styles.line, on && styles.onText]}>{o.line}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  option: { minHeight: touch.min, padding: 10, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.bg, gap: 2 },
  on: { backgroundColor: colors.selected },
  pressed: { backgroundColor: colors.info },
  title: { fontSize: 16, fontWeight: '800', color: colors.muted },
  line: { fontSize: type.body, fontWeight: '800', color: colors.text },
  onText: { color: colors.onSelected },
});
