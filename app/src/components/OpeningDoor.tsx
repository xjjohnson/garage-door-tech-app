import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

const W = 132;
const H = 104;
export const DOOR_BARS = 4;
const BAR_H = H / DOOR_BARS;

/** Percent shown for a stage 0 to 4: 0, 25, 50, 75, 100. */
export const stagePercent = (stage: number) => Math.round((Math.max(0, Math.min(DOOR_BARS, stage)) / DOOR_BARS) * 100);

/**
 * A small garage door that is also the loading bar: it starts with four bars, and each loading
 * stage lifts the lowest bar away (25% leaves three, 50% two, 75% one, 100% none, so the door
 * is open and the light shows). Drawn with plain views and the built-in animation (no images,
 * no packages). Fixed colors on purpose: it only shows on the dark green opening screen.
 */
export function OpeningDoor({ stage }: { stage: number }) {
  const bars = useRef(Array.from({ length: DOOR_BARS }, () => new Animated.Value(1))).current;
  useEffect(() => {
    const gone = Math.max(0, Math.min(DOOR_BARS, stage));
    const anims = bars.map((v, i) => Animated.timing(v, { toValue: i >= DOOR_BARS - gone ? 0 : 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }));
    Animated.parallel(anims).start();
    return () => anims.forEach((a) => a.stop());
  }, [stage, bars]);
  return (
    <View testID="opening-door" accessibilityLabel={`Opening, ${stagePercent(stage)} percent`} style={{ width: W + 16, height: H + 16, borderRadius: 8, backgroundColor: '#E9EFE6' }}>
      {/* The light inside the garage, which the bars cover until they lift away. */}
      <View style={{ position: 'absolute', top: 8, left: 8, width: W, height: H, overflow: 'hidden', backgroundColor: '#FFD66B' }}>
        {bars.map((v, i) => (
          <Animated.View
            key={i}
            testID={`opening-door-bar-${i}`}
            style={{
              position: 'absolute',
              top: i * BAR_H,
              width: W,
              height: BAR_H,
              backgroundColor: i % 2 === 0 ? '#D9E4D5' : '#C9D8C4',
              borderBottomWidth: 2,
              borderBottomColor: '#9DB39A',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 10,
              opacity: v,
              transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-BAR_H, 0] }) }],
            }}
          >
            {[0, 1, 2].map((w) => (
              <View key={w} style={{ width: 28, height: BAR_H - 12, borderRadius: 3, backgroundColor: 'rgba(0,45,4,0.07)' }} />
            ))}
          </Animated.View>
        ))}
      </View>
    </View>
  );
}
