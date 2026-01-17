/**
 * React 19 type compatibility overrides
 *
 * This file provides type compatibility for React 19 with libraries
 * that have not yet updated their type definitions.
 *
 * The issue is that React 19 adds 'bigint' to ReactNode, but older
 * library type definitions don't include it, causing type conflicts.
 */

import '@types/react';

declare module '@types/react' {
  interface ReactElement {
    // Extend as needed
  }
}

// Override for expo-router and react-navigation
declare module 'expo-router' {
  import { ComponentType, ReactNode } from 'react';

  export const Stack: ComponentType<any> & {
    Screen: ComponentType<any>;
  };

  export const Tabs: ComponentType<any> & {
    Screen: ComponentType<any>;
  };

  export const Slot: ComponentType<any>;
  export const Link: ComponentType<any>;
  export const useRouter: () => any;
  export function useLocalSearchParams<T extends Record<string, string> = Record<string, string>>(): T;
  export const useSegments: () => any;
  export const useFocusEffect: (callback: () => void) => void;
  export const Redirect: ComponentType<any>;
}

// Override for vector icons
declare module '@expo/vector-icons' {
  import { ComponentType } from 'react';

  export const Ionicons: ComponentType<any>;
  export const MaterialCommunityIcons: ComponentType<any>;
  export const MaterialIcons: ComponentType<any>;
  export const FontAwesome: ComponentType<any>;
  export const Feather: ComponentType<any>;
}

declare module '@expo/vector-icons/Ionicons' {
  import { ComponentType } from 'react';
  const Ionicons: ComponentType<any>;
  export default Ionicons;
}

declare module '@expo/vector-icons/MaterialCommunityIcons' {
  import { ComponentType } from 'react';
  const MaterialCommunityIcons: ComponentType<any>;
  export default MaterialCommunityIcons;
}

declare module '@expo/vector-icons/MaterialIcons' {
  import { ComponentType } from 'react';
  const MaterialIcons: ComponentType<any>;
  export default MaterialIcons;
}

declare module '@expo/vector-icons/FontAwesome' {
  import { ComponentType } from 'react';
  const FontAwesome: ComponentType<any>;
  export default FontAwesome;
}

declare module '@expo/vector-icons/Feather' {
  import { ComponentType } from 'react';
  const Feather: ComponentType<any>;
  export default Feather;
}

// @react-native-community/slider types (with React 19 compatibility)
declare module '@react-native-community/slider' {
  import { FC } from 'react';
  interface SliderProps {
    value?: number;
    minimumValue?: number;
    maximumValue?: number;
    step?: number;
    onValueChange?: (value: number) => void;
    onSlidingComplete?: (value: number) => void;
    minimumTrackTintColor?: string;
    maximumTrackTintColor?: string;
    thumbTintColor?: string;
    style?: any;
    disabled?: boolean;
    testID?: string;
  }
  const Slider: FC<SliderProps>;
  export default Slider;
}
