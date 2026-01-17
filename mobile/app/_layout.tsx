import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '../src/stores/authStore';
import { authApi } from '../src/services/api';

// Prevent splash screen auto-hide
SplashScreen.preventAutoHideAsync();

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30000,
    },
  },
});

function useProtectedRoute() {
  const segments = useSegments();
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      // Redirect to login
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      // Redirect to home
      router.replace('/(tabs)');
    } else if (isAuthenticated && user && !user.firstName) {
      // User needs to complete profile
      router.replace('/(auth)/complete-profile');
    }
  }, [isAuthenticated, isLoading, user, segments]);
}

async function registerForPushNotifications() {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync();
  return token.data;
}

export default function RootLayout() {
  const { setDeviceId, setLoading, accessToken, deviceId } = useAuthStore();

  useProtectedRoute();

  useEffect(() => {
    async function initialize() {
      try {
        // Generate or restore device ID
        if (!deviceId) {
          const newDeviceId = `${Device.modelName}-${Date.now()}`;
          setDeviceId(newDeviceId);
        }

        // Register for push notifications
        const pushToken = await registerForPushNotifications();
        if (pushToken && accessToken && deviceId) {
          try {
            await authApi.updateFcmToken(pushToken, deviceId);
          } catch (error) {
            console.error('Failed to register push token:', error);
          }
        }
      } finally {
        setLoading(false);
        await SplashScreen.hideAsync();
      }
    }

    initialize();
  }, []);

  // Listen for notifications
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification);
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        // Handle notification tap - navigate to relevant screen
        console.log('Notification tapped:', data);
      },
    );

    return () => {
      subscription.remove();
      responseSubscription.remove();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#1a1a2e',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          contentStyle: {
            backgroundColor: '#0f0f23',
          },
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </QueryClientProvider>
  );
}
