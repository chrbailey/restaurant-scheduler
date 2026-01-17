import { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../../src/services/api';

export default function LoginScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  const requestOtp = useMutation({
    mutationFn: () => authApi.requestOtp(formatPhone(phone)),
    onSuccess: (response) => {
      const isNewUser = response.data.isNewUser;
      router.push({
        pathname: '/(auth)/verify',
        params: { phone: formatPhone(phone), isNewUser: isNewUser ? '1' : '0' },
      });
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Failed to send verification code');
    },
  });

  const formatPhone = (input: string): string => {
    // Remove non-digits
    const digits = input.replace(/\D/g, '');
    // Add +1 if US number without country code
    if (digits.length === 10) {
      return `+1${digits}`;
    }
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    }
    return `+${digits}`;
  };

  const formatDisplay = (input: string): string => {
    const digits = input.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const isValidPhone = phone.replace(/\D/g, '').length >= 10;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Restaurant Scheduler</Text>
          <Text style={styles.subtitle}>
            Enter your phone number to get started
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Phone Number</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.countryCode}>+1</Text>
            <TextInput
              style={styles.input}
              value={formatDisplay(phone)}
              onChangeText={(text) => {
                setPhone(text.replace(/\D/g, ''));
                setError('');
              }}
              placeholder="(555) 123-4567"
              placeholderTextColor="#666"
              keyboardType="phone-pad"
              autoFocus
              maxLength={14}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, !isValidPhone && styles.buttonDisabled]}
            onPress={() => requestOtp.mutate()}
            disabled={!isValidPhone || requestOtp.isPending}
          >
            {requestOtp.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Continue</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.disclaimer}>
          By continuing, you agree to our Terms of Service and Privacy Policy.
          Standard message and data rates may apply.
        </Text>
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
    justifyContent: 'center',
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
  },
  form: {
    marginBottom: 40,
  },
  label: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    marginBottom: 16,
  },
  countryCode: {
    fontSize: 18,
    color: '#fff',
    paddingHorizontal: 16,
    borderRightWidth: 1,
    borderRightColor: '#2a2a4e',
    paddingVertical: 16,
  },
  input: {
    flex: 1,
    fontSize: 18,
    color: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  error: {
    color: '#ff4444',
    fontSize: 14,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#4a90d9',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#2a4a6e',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },
});
