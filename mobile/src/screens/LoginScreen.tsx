/**
 * Sign-in / shop selection.
 *
 * One centred card on a tinted canvas: brand mark above, credentials inside.
 * The language switcher and theme toggle sit above the card so they stay
 * reachable but never compete with the primary action.
 */
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { ApplicationMark, ActionButton, Field, ThemeToggle } from '../theme/primitives';
import { useWorkspace } from '../hooks/useWorkspace';

export function LoginScreen() {
  const styles = useAppStyles();
  const { palette, themeMode, branding } = useAppTheme();
  const ws = useWorkspace();
  const choosingShop = ws.shopChoices.length > 0;

  return (
    <SafeAreaView style={[styles.safe, ws.rtl && styles.rtlLayout]}>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.grow}>
        <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
          <View style={styles.authLanguageRow}>
            {ws.languageOptions.map((option) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: ws.language === option.id }}
                android_ripple={{ color: palette.brand50 }}
                key={option.id}
                onPress={() => void ws.setLanguage(option.id)}
                style={({ pressed }) => [
                  styles.languageChip,
                  ws.language === option.id && styles.languageChipSelected,
                  pressed && styles.chipPressed,
                ]}
              >
                <Text style={[styles.languageChipText, ws.language === option.id && styles.chipTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
            <ThemeToggle copy={ws.copy} compact />
          </View>

          <View style={{ alignItems: 'center' }}>
            <ApplicationMark size="lg" />
            <Text style={styles.authBrandName}>{branding.brandName}</Text>
            <Text style={styles.authTagline}>{branding.tagline || ws.copy.tagline}</Text>
            {branding.description ? <Text style={styles.authDescription}>{branding.description}</Text> : null}
          </View>

          <View style={styles.authCard}>
            <Text style={styles.authCardTitle}>
              {choosingShop ? ws.copy.chooseShop : branding.loginTitle || ws.copy.signInTitle}
            </Text>
            {choosingShop ? (
              <>
                {ws.shopChoices.map((shop) => (
                  <ActionButton
                    key={shop.id}
                    title={shop.name}
                    loading={ws.selectingShopId === shop.id}
                    loadingTitle={ws.copy.loading}
                    onPress={() => void ws.selectShop(shop)}
                    disabled={ws.authBusy}
                    secondary
                  />
                ))}
              </>
            ) : (
              <>
                <Field label={ws.copy.email} value={ws.email} onChangeText={ws.setEmail} keyboardType="email-address" />
                <Field label={ws.copy.password} value={ws.password} onChangeText={ws.setPassword} secureTextEntry />
                {ws.error ? <Text accessibilityRole="alert" style={styles.errorText}>{ws.error}</Text> : null}
                <ActionButton
                  title={ws.copy.signIn}
                  loading={ws.authBusy}
                  loadingTitle={ws.copy.loading}
                  onPress={() => void ws.handleSignIn()}
                  disabled={ws.authBusy || !ws.email.trim() || !ws.password}
                />
              </>
            )}
            {choosingShop && ws.error ? <Text accessibilityRole="alert" style={styles.errorText}>{ws.error}</Text> : null}
            {branding.footerText ? <Text style={styles.authFooter}>{branding.footerText}</Text> : null}
            {(branding.supportUrl || branding.supportEmail) ? (
              <View style={styles.supportLinks}>
                {branding.supportUrl ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL(branding.supportUrl).catch(() => Alert.alert(ws.copy.error))}
                    style={({ pressed }) => [pressed && styles.pressed]}
                  >
                    <Text style={styles.supportLink}>{ws.copy.support}</Text>
                  </Pressable>
                ) : null}
                {branding.supportEmail ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL(`mailto:${branding.supportEmail}`).catch(() => Alert.alert(ws.copy.error))}
                    style={({ pressed }) => [pressed && styles.pressed]}
                  >
                    <Text style={styles.supportLink}>{ws.copy.emailSupport}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
