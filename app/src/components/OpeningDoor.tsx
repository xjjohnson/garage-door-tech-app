import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

const W = 132;
const H = 104;
const PANELS = 4;
const PANEL_H = H / PANELS;

/**
 * A small garage door that rolls up to show a warm light, holds, drops and repeats. Drawn with
 * plain views and the built-in animation (no images, no packages), so it adds nothing to the start.
 * Fixed colors on purpose: it only shows on the dark green opening screen, before any theme.
 */
export function OpeningDoor() {
  const lift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(250),
        Animated.timing(lift, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.delay(450),
        Animated.timing(lift, { toValue: 0, duration: 650, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [lift]);
  const y = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -H] });
  return (
    <View testID="opening-door" accessibilityLabel="Garage door opening" style={{ width: W + 16, height: H + 16, alignItems: 'center', justifyContent: 'flex-end' }}>
      {/* The frame, and the light inside the garage. */}
      <View style={{ width: W + 16, height: H + 16, borderRadius: 8, backgroundColor: '#E9EFE6', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 0 }}>
        <View style={{ position: 'absolute', top: 8, width: W, height: H, overflow: 'hidden', backgroundColor: '#FFD66B' }}>
          <Animated.View style={{ width: W, height: H, transform: [{ translateY: y }] }}>
            {Array.from({ length: PANELS }).map((_, i) => (
              <View key={i} style={{ width: W, height: PANEL_H, backgroundColor: i % 2 === 0 ? '#D9E4D5' : '#C9D8C4', borderBottomWidth: 2, borderBottomColor: '#9DB39A', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 }}>
                {[0, 1, 2].map((w) => (
                  <View key={w} style={{ width: 28, height: PANEL_H - 12, borderRadius: 3, backgroundColor: 'rgba(0,45,4,0.07)' }} />
                ))}
              </View>
            ))}
          </Animated.View>
        </View>
      </View>
    </View>
  );
}
