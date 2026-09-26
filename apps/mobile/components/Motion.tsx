import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { motion, useReducedMotion } from '../lib/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressableScale({ children, disabled, onPressIn, onPressOut, pressedScale = 0.98, style, ...props }: Omit<PressableProps, 'children' | 'style'> & {
  children: ReactNode;
  pressedScale?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={(event) => {
        if (!disabled && !reduced) Animated.timing(scale, { duration: motion.pressIn, easing: Easing.out(Easing.quad), toValue: pressedScale, useNativeDriver: true }).start();
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (!disabled && !reduced) Animated.spring(scale, { damping: 18, mass: 0.55, stiffness: 250, toValue: 1, useNativeDriver: true }).start();
        onPressOut?.(event);
      }}
      style={[style, !reduced && { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

export function FadeInView({ children, delay = 0, distance = 8, enabled = true, style }: { children: ReactNode; delay?: number; distance?: number; enabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(reduced || !enabled ? 1 : 0)).current;

  useEffect(() => {
    if (reduced || !enabled) { progress.setValue(1); return; }
    progress.setValue(0);
    const animation = Animated.timing(progress, { delay, duration: motion.entrance, easing: Easing.out(Easing.cubic), toValue: 1, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [delay, enabled, progress, reduced]);

  return <Animated.View style={[style, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] }]}>{children}</Animated.View>;
}

export function AnimatedNumber({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const animated = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(reduced ? value : 0);

  useEffect(() => {
    if (reduced) { animated.setValue(value); setDisplay(value); return; }
    const id = animated.addListener(({ value: next }) => setDisplay(Math.round(next)));
    Animated.timing(animated, { duration: motion.entrance, easing: Easing.out(Easing.cubic), toValue: value, useNativeDriver: false }).start();
    return () => animated.removeListener(id);
  }, [animated, reduced, value]);

  return <>{display}</>;
}

export function AnimatedProgress({ color, percentage }: { color: string; percentage: number }) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(reduced ? percentage : 0)).current;

  useEffect(() => {
    if (reduced) { progress.setValue(percentage); return; }
    Animated.timing(progress, { duration: motion.state, easing: Easing.out(Easing.cubic), toValue: percentage, useNativeDriver: false }).start();
  }, [percentage, progress, reduced]);

  return <Animated.View style={[styles.progress, { backgroundColor: color, width: progress.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />;
}

export function ThinkingDots({ color }: { color: string }) {
  const reduced = useReducedMotion();
  const dotOne = useRef(new Animated.Value(0.45)).current;
  const dotTwo = useRef(new Animated.Value(0.45)).current;
  const dotThree = useRef(new Animated.Value(0.45)).current;
  const dots = useMemo(() => [dotOne, dotTwo, dotThree], [dotOne, dotThree, dotTwo]);

  useEffect(() => {
    if (reduced) return;
    const animations = dots.map((dot, index) => Animated.loop(Animated.sequence([
      Animated.delay(index * 120),
      Animated.timing(dot, { duration: 280, toValue: 1, useNativeDriver: true }),
      Animated.timing(dot, { duration: 280, toValue: 0.45, useNativeDriver: true }),
      Animated.delay((2 - index) * 120)
    ])));
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [dots, reduced]);

  return <View accessibilityLabel="Thinking" style={styles.dots}>{dots.map((dot, index) => <Animated.View key={index} style={[styles.dot, { backgroundColor: color, opacity: dot, transform: [{ scale: dot.interpolate({ inputRange: [0.45, 1], outputRange: [0.78, 1] }) }] }]} />)}</View>;
}

export function SuccessPulse({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(reduced ? 1 : 0.72)).current;

  useEffect(() => {
    if (reduced) { scale.setValue(1); return; }
    Animated.sequence([
      Animated.spring(scale, { damping: 10, mass: 0.55, stiffness: 260, toValue: 1.14, useNativeDriver: true }),
      Animated.spring(scale, { damping: 14, mass: 0.6, stiffness: 220, toValue: 1, useNativeDriver: true })
    ]).start();
  }, [reduced, scale]);

  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  dot: { borderRadius: 4, height: 7, width: 7 },
  dots: { alignItems: 'center', flexDirection: 'row', gap: 5, minHeight: 18 },
  progress: { borderRadius: 999, height: '100%' }
});
