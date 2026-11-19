import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { ChipOption, ChipRow } from './controls';
import { setCustomerType, typesFor } from '../lib/customerTypes';
import { useCustomerType } from '../lib/useCustomerType';
import { useInvoices } from '../lib/useInvoices';
import { useOdoo } from '../lib/useOdoo';
import { colors, fs, sp } from '../theme';

/** The customer's type (Homeowner, Commercial...), kept as a tag on their contact in Odoo. */
export function CustomerTypeRow({ partnerId }: { partnerId: number }) {
  const { client } = useOdoo();
  const { business } = useInvoices();
  const { type, setType } = useCustomerType(partnerId);
  const [err, setErr] = useState('');
  const all = typesFor(business);
  const options: ChipOption<string>[] = [{ label: 'Not set', value: '' }, ...all.map((t) => ({ label: t, value: t }))];
  return (
    <View style={styles.box} testID="customer-type">
      <Text style={styles.label}>Customer type</Text>
      <ChipRow
        options={options}
        value={type ?? ''}
        onChange={(v) => {
          if (!client) return;
          const next = v || undefined;
          setErr('');
          setCustomerType(client, partnerId, next, all)
            .then(() => setType(next))
            .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
        }}
        scroll
        testID="customer-type-chips"
      />
      {err ? <Text style={styles.note}>Not saved: {err}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: sp(6) },
  label: { fontSize: fs(16), fontWeight: '700', color: colors.muted },
  note: { fontSize: fs(15), color: colors.muted },
});
