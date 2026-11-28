import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from './AppText';
import { Icon, IconName } from './Icon';
import { look, colors, radius, shadow, touch, type, bw, fs, rad, sz, sp } from '../theme';
import { makeStyles } from '../lib/makeStyles';

/** The shared card pieces of the Tools and Settings pages (style H1): grouped rows, tiles, a quiet section label and an alert banner. */

/** A quiet label above a group, left-aligned. */
export function Caption({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return (
    <Text style={styles.caption} accessibilityRole="header">
      {children}
    </Text>
  );
}

/** One white rounded card that holds a run of rows. */
export function RowGroup({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.group}>{children}</View>;
}

interface IconRowProps {
  icon: IconName;
  label: string;
  detail?: string;
  href?: Href;
  onPress?: () => void;
  testID?: string;
  /** A small pill after the text, e.g. "4 low". */
  badge?: string;
  /** Draws the icon and badge in the warning colors. */
  warn?: boolean;
  /** A quiet tag beside the name, e.g. "Owner only". */
  tag?: string;
  /** The last row in a group has no line under it. */
  last?: boolean;
  /** Hides the chevron, for rows that do not open a page. */
  noChevron?: boolean;
  right?: ReactNode;
}

/** An icon, a name, a one-line hint and a chevron. */
export function IconRow({ icon, label, detail, href, onPress, testID, badge, warn, tag, last, noChevron, right }: IconRowProps) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress ?? (() => href && router.push(href))}
      accessibilityRole="button"
      accessibilityHint={detail}
      testID={testID}
      style={({ pressed }) => [styles.row, !last && styles.rowLine, pressed && styles.pressed]}
    >
      <View style={[styles.icon, warn && styles.iconWarn]}>
        <Icon name={icon} size={22} color={warn ? colors.warn : colors.selected} />
      </View>
      <View style={styles.text}>
        <View style={styles.nameLine}>
          <Text style={styles.name}>{label}</Text>
          {tag ? <Text style={styles.tag}>{tag}</Text> : null}
        </View>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      {badge ? <Text style={[styles.badge, !warn && styles.badgeOk]}>{badge}</Text> : null}
      {right}
      {noChevron ? null : <Icon name="chevron" size={18} color={colors.muted} />}
    </Pressable>
  );
}

/** A square card tile for the tools used most: icon, name and a short hint. */
export function ToolTile({ icon, label, detail, href, testID }: { icon: IconName; label: string; detail: string; href: Href; testID?: string }) {
  const styles = useStyles();
  return (
    <Pressable onPress={() => router.push(href)} accessibilityRole="button" accessibilityHint={detail} testID={testID} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <View style={styles.icon}>
        <Icon name={icon} size={22} color={colors.selected} />
      </View>
      <View style={styles.tileText}>
        <Text style={styles.name}>{label}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
    </Pressable>
  );
}

/** The one thing that needs a look, in warning colors, with a button. */
export function AlertBanner({ title, detail, action, onPress, testID, tone = 'warn' }: { title: string; detail?: string; action: string; onPress: () => void; testID?: string; tone?: 'warn' | 'ok' }) {
  const styles = useStyles();
  const ok = tone === 'ok';
  return (
    <View style={[styles.alert, ok && styles.alertOk]} testID={testID}>
      <Icon name={ok ? 'wrap' : 'warn'} size={24} color={ok ? colors.selected : colors.warn} />
      <View style={styles.text}>
        <Text style={[styles.alertTitle, ok && styles.alertTextOk]}>{title}</Text>
        {detail ? <Text style={[styles.alertDetail, ok && styles.alertTextOk]}>{detail}</Text> : null}
      </View>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${action}: ${title}`} style={({ pressed }) => [styles.alertButton, ok && styles.alertButtonOk, pressed && styles.pressed]}>
        <Text style={[styles.alertButtonText, ok && styles.alertButtonTextOk]}>{action}</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  caption: { fontSize: fs(14), fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.muted, marginTop: sp(6), marginLeft: sp(4) },
  group: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: bw(1), borderColor: colors.line, overflow: 'hidden', ...shadow },
  row: { minHeight: look.size === 'legacy' ? touch.min + 6 : touch.min, flexDirection: 'row', alignItems: 'center', gap: sp(12), paddingHorizontal: sp(14), paddingVertical: sp(10) },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.line },
  pressed: { backgroundColor: colors.info },
  icon: { width: Math.max(32, sz(40)), height: Math.max(32, sz(40)), borderRadius: rad(12), backgroundColor: colors.info, alignItems: 'center', justifyContent: 'center' },
  iconWarn: { backgroundColor: colors.warnBg },
  text: { flex: 1, gap: sp(2) },
  nameLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: sp(8) },
  name: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'left' },
  detail: { fontSize: fs(15), fontWeight: '600', color: colors.muted, textAlign: 'left' },
  tag: { fontSize: fs(12), fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.muted, borderWidth: bw(1), borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: sp(8), paddingVertical: sp(1), overflow: 'hidden' },
  badge: { fontSize: fs(14), fontWeight: '800', color: colors.warn, backgroundColor: colors.warnBg, paddingHorizontal: sp(10), paddingVertical: sp(3), borderRadius: radius.pill, overflow: 'hidden' },
  badgeOk: { color: colors.selected, backgroundColor: colors.info },
  tile: { width: '48.5%', minHeight: look.size === 'legacy' ? 124 : touch.min + 20, ...(look.size === 'legacy' ? { justifyContent: 'space-between' as const } : { flexDirection: 'row' as const, alignItems: 'center' as const }), gap: sp(10), padding: sp(14), borderRadius: radius.card, backgroundColor: colors.card, borderWidth: bw(1), borderColor: colors.line, ...shadow },
  tileText: { gap: sp(2), ...(look.size === 'legacy' ? {} : { flex: 1 }) },
  alert: { flexDirection: 'row', alignItems: 'center', gap: sp(12), padding: sp(12), borderRadius: radius.card, backgroundColor: colors.warnBg },
  alertTitle: { fontSize: type.body, fontWeight: '800', color: colors.warn },
  alertDetail: { fontSize: fs(15), fontWeight: '600', color: colors.warn },
  alertButton: { minHeight: sz(44), minWidth: 76, borderRadius: radius.field, backgroundColor: colors.warn, alignItems: 'center', justifyContent: 'center', paddingHorizontal: sp(14) },
  alertOk: { backgroundColor: colors.info },
  alertTextOk: { color: colors.selected },
  alertButtonOk: { backgroundColor: colors.selected },
  alertButtonTextOk: { color: colors.onSelected },
  alertButtonText: { fontSize: fs(15), fontWeight: '800', color: colors.warnBg },
}));
