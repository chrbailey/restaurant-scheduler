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
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { userApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';

export default function CompleteProfileScreen() {
  const router = useRouter();
  const { setUser, user } = useAuthStore();

  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [error, setError] = useState('');

  const updateProfile = useMutation({
    mutationFn: () => userApi.updateProfile({ firstName, lastName }),
    onSuccess: (response) => {
      setUser(response.data);
      router.replace('/(tabs)');
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Failed to update profile');
    },
  });

  const isValid = firstName.trim().length >= 2 && lastName.trim().length >= 2;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Welcome! 👋</Text>
          <Text style={styles.subtitle}>
            Let's set up your profile so your coworkers can recognize you.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>First Name</Text>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={(text) => {
                setFirstName(text);
                setError('');
              }}
              placeholder="Enter your first name"
              placeholderTextColor="#666"
              autoFocus
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Last Name</Text>
            <TextInput
              style={styles.input}
              value={lastName}
              onChangeText={(text) => {
                setLastName(text);
                setError('');
              }}
              placeholder="Enter your last name"
              placeholderTextColor="#666"
              autoCapitalize="words"
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, !isValid && styles.buttonDisabled]}
            onPress={() => updateProfile.mutate()}
            disabled={!isValid || updateProfile.isPending}
          >
            {updateProfile.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Get Started</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    lineHeight: 24,
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    color: '#888',
  },
  input: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    padding: 16,
    fontSize: 16,
    color: '#fff',
  },
  error: {
    color: '#ff4444',
    fontSize: 14,
  },
  button: {
    backgroundColor: '#4a90d9',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    backgroundColor: '#2a4a6e',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
