import { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { colors } from '../theme';
import { DOOR_BARS, stagePercent } from './OpeningDoor';

const TRACK_W = 160;

/**
 * The loading mark of the FS Crew app: the letters FS with an underline that fills from the left as
 * each loading stage finishes (25, 50, 75, 100%), in the company's brand color once it is known.
 * Same stages as the Johnsons door, so the two share one progress rule.
 */
export function OpeningFs({ stage }: { stage: number }) {
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const done = Math.max(0, Math.min(DOOR_BARS, stage)) / DOOR_BARS;
    const anim = Animated.timing(fill, { toValue: done, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [stage, fill]);
  const color = colors.brand;
  return (
    <View testID="opening-fs" accessibilityLabel={`Opening, ${stagePercent(stage)} percent`} style={{ alignItems: 'center' }}>
      <Text style={{ color, fontSize: 84, fontWeight: '800', letterSpacing: -2 }}>FS</Text>
      <View style={{ width: TRACK_W, height: 10, borderRadius: 5, marginTop: 6, backgroundColor: `${color}33`, overflow: 'hidden' }}>
        <Animated.View testID="opening-fs-fill" style={{ height: 10, borderRadius: 5, backgroundColor: color, width: fill.interpolate({ inputRange: [0, 1], outputRange: [0, TRACK_W] }) }} />
      </View>
    </View>
  );
}
