import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, View } from 'react-native';

const MARK = require('../../assets/brand/mark.png');

/** The Johnsons mark is 256 px square: the roof and star above y 130, four door bars below (measured from mark.png). */
const MARK_PX = 256;
const ROOF_PX = 130;
const BARS = [
  { y: 132, h: 22 },
  { y: 166, h: 22 },
  { y: 200, h: 22 },
  { y: 233, h: 23 },
];
const BAR_X = 60;
const BAR_W = 138;
const BAR_R = 9;
export const DOOR_BARS = BARS.length;
const SIZE = 150;
const K = SIZE / MARK_PX;

/** Percent shown for a stage 0 to 4: 0, 25, 50, 75, 100. */
export const stagePercent = (stage: number) => Math.round((Math.max(0, Math.min(DOOR_BARS, stage)) / DOOR_BARS) * 100);

/**
 * The Johnsons logo as the loading bar: it starts whole, with its four door bars, and each loading
 * stage lifts the lowest bar away (25% leaves three, 50% two, 75% one, 100% none, so the door is
 * open and only the roof and star are left). The roof and star are the real logo file; the bars
 * are drawn on top in the logo's own position and green, so each can move on its own.
 */
export function OpeningDoor({ stage }: { stage: number }) {
  const bars = useRef(BARS.map(() => new Animated.Value(1))).current;
  useEffect(() => {
    const gone = Math.max(0, Math.min(DOOR_BARS, stage));
    const anims = bars.map((v, i) => Animated.timing(v, { toValue: i >= DOOR_BARS - gone ? 0 : 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }));
    Animated.parallel(anims).start();
    return () => anims.forEach((a) => a.stop());
  }, [stage, bars]);
  return (
    <View testID="opening-door" accessibilityLabel={`Opening, ${stagePercent(stage)} percent`} style={{ width: SIZE, height: SIZE }}>
      {/* Roof and star: the top of the real logo file, cropped above the door bars. */}
      <View style={{ position: 'absolute', top: 0, left: 0, width: SIZE, height: ROOF_PX * K, overflow: 'hidden' }}>
        <Image source={MARK} style={{ width: SIZE, height: SIZE }} resizeMode="contain" />
      </View>
      {BARS.map((b, i) => (
        <Animated.View
          key={i}
          testID={`opening-door-bar-${i}`}
          style={{
            position: 'absolute',
            top: b.y * K,
            left: BAR_X * K,
            width: BAR_W * K,
            height: b.h * K,
            borderRadius: BAR_R * K,
            backgroundColor: '#002D04',
            opacity: bars[i]!,
            transform: [{ translateY: bars[i]!.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }],
          }}
        />
      ))}
    </View>
  );
}
