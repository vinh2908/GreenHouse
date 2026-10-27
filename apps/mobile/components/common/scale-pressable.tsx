import React, { useRef } from 'react';
import { Pressable, Animated, Platform, type PressableProps } from 'react-native';

interface ScalePressableProps extends PressableProps {
  children: React.ReactNode;
  activeScale?: number;
  style?: any;
}

export function ScalePressable({
  children,
  onPress,
  style,
  activeScale = 0.96,
  disabled = false,
  ...props
}: ScalePressableProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = (e: any) => {
    Animated.spring(scale, {
      toValue: activeScale,
      useNativeDriver: Platform.OS !== 'web',
      speed: 45,
      bounciness: 4,
    }).start();
    props.onPressIn?.(e);
  };

  const onPressOut = (e: any) => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: Platform.OS !== 'web',
      speed: 40,
      bounciness: 8,
    }).start();
    props.onPressOut?.(e);
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      {...props}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

