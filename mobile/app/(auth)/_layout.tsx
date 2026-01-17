import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: '#0f0f23',
        },
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="verify" />
      <Stack.Screen name="complete-profile" />
    </Stack>
  );
}
