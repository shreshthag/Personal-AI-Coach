import { useEffect, useState } from "react";
import { Animated, View } from "react-native";

export function TypingDots() {
  const [animations] = useState(() => [new Animated.Value(0.35), new Animated.Value(0.35), new Animated.Value(0.35)]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.stagger(
        130,
        animations.map((animation) =>
          Animated.sequence([
            Animated.timing(animation, { toValue: 1, duration: 350, useNativeDriver: true }),
            Animated.timing(animation, { toValue: 0.35, duration: 350, useNativeDriver: true })
          ])
        )
      )
    );
    loop.start();
    return () => loop.stop();
  }, [animations]);

  return (
    <View className="flex-row items-center gap-1.5" accessibilityLabel="Coach is typing">
      {animations.map((opacity, index) => (
        <Animated.View key={index} className="h-1.5 w-1.5 rounded-full bg-leaf" style={{ opacity }} />
      ))}
    </View>
  );
}

export function StreamingCaret() {
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.15, duration: 500, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View className="ml-1 h-4 w-0.5 self-end bg-leaf" style={{ opacity }} />;
}
