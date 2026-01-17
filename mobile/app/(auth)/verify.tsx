import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { authApi, userApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';

const OTP_LENGTH = 6;

export default function VerifyScreen() {
  const router = useRouter();
  const { phone, isNewUser } = useLocalSearchParams<{ phone: string; isNewUser: string }>();
  const { setTokens, setUser, setProfiles, deviceId } = useAuthStore();

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [resendCountdown, setResendCountdown] = useState(30);
  const inputRef = useRef<TextInput>(null);

  // Countdown timer for resend
  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);

  const verifyOtp = useMutation({
    mutationFn: () => authApi.verifyOtp(phone!, code, deviceId!, 'Mobile App'),
    onSuccess: async (response) => {
      const { accessToken, refreshToken, expiresAt, user } = response.data;
      setTokens(accessToken, refreshToken, expiresAt);
      setUser(user);

      // Fetch user's restaurant profiles
      try {
        const profilesResponse = await userApi.getRestaurants();
        setProfiles(
          profilesResponse.data.map((p: any) => ({
            id: p.id,
            restaurantId: p.restaurantId,
            restaurantName: p.restaurant.name,
            role: p.role,
            positions: p.positions,
            tier: p.tier,
          })),
        );
      } catch (err) {
        console.error('Failed to fetch profiles:', err);
      }

      // Navigate based on user state
      if (isNewUser === '1' || !user.firstName) {
        router.replace('/(auth)/complete-profile');
      } else {
        router.replace('/(tabs)');
      }
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Invalid verification code');
      setCode('');
    },
  });

  const resendOtp = useMutation({
    mutationFn: () => authApi.requestOtp(phone!),
    onSuccess: () => {
      setResendCountdown(30);
      setError('');
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Failed to resend code');
    },
  });

  const handleCodeChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setCode(digits);
    setError('');

    // Auto-submit when complete
    if (digits.length === OTP_LENGTH) {
      verifyOtp.mutate();
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>Enter Code</Text>
          <Text style={styles.subtitle}>
            We sent a verification code to{'\n'}
            <Text style={styles.phone}>{phone}</Text>
          </Text>
        </View>

        <View style={styles.codeContainer}>
          <TextInput
            ref={inputRef}
            style={styles.hiddenInput}
            value={code}
            onChangeText={handleCodeChange}
            keyboardType="number-pad"
            autoFocus
            maxLength={OTP_LENGTH}
          />

          <View style={styles.codeBoxes}>
            {Array.from({ length: OTP_LENGTH }).map((_, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.codeBox, code.length === i && styles.codeBoxActive]}
                onPress={() => inputRef.current?.focus()}
              >
                <Text style={styles.codeDigit}>{code[i] || ''}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {verifyOtp.isPending && (
          <View style={styles.loading}>
            <ActivityIndicator color="#4a90d9" size="large" />
            <Text style={styles.loadingText}>Verifying...</Text>
          </View>
        )}

        <View style={styles.resendContainer}>
          {resendCountdown > 0 ? (
            <Text style={styles.resendText}>
              Resend code in {resendCountdown}s
            </Text>
          ) : (
            <TouchableOpacity
              onPress={() => resendOtp.mutate()}
              disabled={resendOtp.isPending}
            >
              <Text style={styles.resendLink}>
                {resendOtp.isPending ? 'Sending...' : 'Resend code'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  backButton: {
    marginTop: 48,
    marginBottom: 24,
  },
  backText: {
    color: '#4a90d9',
    fontSize: 16,
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    lineHeight: 24,
  },
  phone: {
    color: '#fff',
    fontWeight: '600',
  },
  codeContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 0,
  },
  codeBoxes: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  codeBox: {
    width: 48,
    height: 56,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2a2a4e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  codeBoxActive: {
    borderColor: '#4a90d9',
  },
  codeDigit: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  error: {
    color: '#ff4444',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  loading: {
    alignItems: 'center',
    marginVertical: 24,
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
  },
  resendContainer: {
    alignItems: 'center',
    marginTop: 24,
  },
  resendText: {
    color: '#666',
    fontSize: 14,
  },
  resendLink: {
    color: '#4a90d9',
    fontSize: 14,
    fontWeight: '600',
  },
});
