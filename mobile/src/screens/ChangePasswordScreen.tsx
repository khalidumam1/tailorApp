/**
 * Change password — shown in two situations:
 *  - forced: an administrator reset this account's password
 *    (`session.mustChangePassword`), so the user must choose their own before
 *    entering the workspace;
 *  - voluntary: opened from Settings.
 *
 * On success the API revokes every session (including this one), so the app
 * returns to the sign-in screen. The workspace's `completePasswordChange`
 * handles that sign-out.
 */
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { ActionButton, ApplicationMark, Field } from '../theme/primitives';
import { useWorkspace } from '../hooks/useWorkspace';

export function ChangePasswordScreen({ forced, onCancel }: { forced: boolean; onCancel?: () => void }) {
  const styles = useAppStyles();
  const { themeMode, branding } = useAppTheme();
  const ws = useWorkspace();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (newPassword.length < 16) {
      setError('Choose a new password of at least 16 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new password and its confirmation do not match.');
      return;
    }
    setBusy(true);
    try {
      await ws.completePasswordChange(currentPassword, newPassword);
      Alert.alert('Password changed', 'Sign in again with your new password.');
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : ws.copy.error);
    } finally {
      setBusy(false);
    }
  };

  const form = (
    <View style={styles.card}>
      <Text style={styles.heading}>{forced ? 'Choose your own password' : 'Change your password'}</Text>
      <Text style={styles.listMeta}>
        {forced
          ? 'An administrator reset your password. Choose your own password to continue — nobody else should know it. You will sign in again with it.'
          : 'After changing your password you will sign in again, and other devices will be signed out.'}
      </Text>
      <Field label="Current password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry />
      <Field label="New password (at least 16 characters)" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
      <Field label="Type the new password again" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
      {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
      <ActionButton
        title={busy ? 'Saving…' : 'Save new password'}
        onPress={() => void submit()}
        disabled={busy || !currentPassword || !newPassword || !confirmPassword}
      />
      {forced ? (
        <ActionButton title="Sign out instead" secondary onPress={() => void ws.handleSignOut()} disabled={busy} />
      ) : onCancel ? (
        <ActionButton title="Cancel" secondary onPress={onCancel} disabled={busy} />
      ) : null}
    </View>
  );

  if (!forced) return form;

  return (
    <SafeAreaView style={[styles.safe, ws.rtl && styles.rtlLayout]}>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.grow}>
        <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
          <ApplicationMark size="lg" />
          <Text style={styles.authBrandName}>{branding.brandName}</Text>
          {form}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
