"use client"

import { useMemo, useState } from "react"
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
  Platform,
} from "react-native"
import { MaterialCommunityIcons } from "@expo/vector-icons"
import { GoogleAuthProvider, createUserWithEmailAndPassword, signInWithPopup } from "firebase/auth"
import { auth } from "../Firebase/fireConfig"
import { colors, spacing, borderRadius, shadows, typography } from "../Styling/ModernLight"

const SignupScreen = ({ navigation }) => {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const emailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), [email])
  const passwordStrong = useMemo(() => {
    return password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password)
  }, [password])
  const passwordsMatch = useMemo(() => password.length > 0 && password === confirmPassword, [password, confirmPassword])

  const handleSignup = async () => {
    if (!emailValid || !passwordStrong || !passwordsMatch || !termsAccepted) {
      Alert.alert("Error", "Please fill all fields correctly and accept terms.")
      return
    }

    setIsLoading(true)
    try {
      const normalizedEmail = email.trim().toLowerCase()
      await createUserWithEmailAndPassword(auth, normalizedEmail, password)
    } catch (error) {
      console.error("Signup error:", error)
      let errorMessage = "Signup failed. Please try again."

      if (error.code === "auth/email-already-in-use") {
        errorMessage = "This email is already in use."
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "Invalid email address."
      } else if (error.code === "auth/weak-password") {
        errorMessage = "Password is too weak."
      } else if (error.code === "auth/network-request-failed") {
        errorMessage = "Network error. Check your internet connection and try again."
      }

      Alert.alert("Signup Error", errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleAuth = async () => {
    setIsLoading(true)
    try {
      if (Platform.OS !== "web") {
        Alert.alert("Google Sign-In", "Google sign-in is currently enabled for web in this build.")
        return
      }

      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
    } catch (error) {
      console.error("Google auth error:", error)
      let errorMessage = "Google sign-in failed. Please try again."

      if (error.code === "auth/popup-closed-by-user") {
        errorMessage = "Google sign-in was canceled."
      } else if (error.code === "auth/popup-blocked") {
        errorMessage = "Popup was blocked by the browser. Please allow popups and try again."
      } else if (error.code === "auth/operation-not-allowed") {
        errorMessage = "Google sign-in is not enabled in Firebase Authentication."
      }

      Alert.alert("Google Sign-In Error", errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <MaterialCommunityIcons name="account-plus-outline" size={40} color={colors.primary} />
          </View>
          <Text style={styles.appName}>Create Account</Text>
          <Text style={styles.subtitle}>Start trading with Binance Mate</Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputContainer}>
              <MaterialCommunityIcons name="email-outline" size={20} color={colors.textTertiary} />
              <TextInput
                style={styles.input}
                placeholder="your@email.com"
                placeholderTextColor={colors.textTertiary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              {email.length > 0 && (
                <MaterialCommunityIcons
                  name={emailValid ? "check-circle" : "alert-circle"}
                  size={18}
                  color={emailValid ? colors.success : colors.danger}
                />
              )}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputContainer}>
              <MaterialCommunityIcons name="lock-outline" size={20} color={colors.textTertiary} />
              <TextInput
                style={styles.input}
                placeholder="Min 8 chars, 1 upper, 1 number"
                placeholderTextColor={colors.textTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <MaterialCommunityIcons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={colors.textTertiary}
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Confirm Password</Text>
            <View style={styles.inputContainer}>
              <MaterialCommunityIcons name="lock-check-outline" size={20} color={colors.textTertiary} />
              <TextInput
                style={styles.input}
                placeholder="Re-enter password"
                placeholderTextColor={colors.textTertiary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                <MaterialCommunityIcons
                  name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={colors.textTertiary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {!!confirmPassword && !passwordsMatch && <Text style={styles.errorText}>Passwords do not match.</Text>}

          <TouchableOpacity style={styles.termsRow} onPress={() => setTermsAccepted(!termsAccepted)}>
            <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
              {termsAccepted && <MaterialCommunityIcons name="check" size={12} color={colors.textInverse} />}
            </View>
            <Text style={styles.termsText}>I agree to the Terms of Service and Privacy Policy</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.signupButton,
              (!emailValid || !passwordStrong || !passwordsMatch || !termsAccepted || isLoading) &&
                styles.signupButtonDisabled,
            ]}
            onPress={handleSignup}
            disabled={!emailValid || !passwordStrong || !passwordsMatch || !termsAccepted || isLoading}
          >
            <View style={styles.buttonContent}>
              {isLoading ? (
                <MaterialCommunityIcons name="loading" size={20} color={colors.textInverse} />
              ) : (
                <View style={styles.buttonContent}>
                  <MaterialCommunityIcons name="account-plus" size={20} color={colors.textInverse} />
                  <Text style={styles.signupButtonText}>Create Account</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity style={styles.googleButton} onPress={handleGoogleAuth} disabled={isLoading}>
            <View style={styles.buttonContent}>
              <MaterialCommunityIcons name="google" size={20} color={colors.error} />
              <Text style={styles.googleButtonText}>Continue With Google</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.loginRow}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate("Login")}>
              <Text style={styles.loginLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: spacing.lg,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceVariant,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  appName: {
    ...typography.h3,
    color: colors.text,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  formCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: "500",
    marginBottom: spacing.xs,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceVariant,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginRight: spacing.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  termsText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flex: 1,
  },
  signupButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    overflow: "hidden",
  },
  signupButtonDisabled: {
    backgroundColor: colors.textTertiary,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  signupButtonText: {
    ...typography.body,
    color: colors.textInverse,
    fontWeight: "600",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.divider,
  },
  dividerText: {
    ...typography.caption,
    color: colors.textTertiary,
    marginHorizontal: spacing.sm,
    textTransform: "uppercase",
  },
  googleButton: {
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  googleButtonText: {
    ...typography.body,
    color: colors.text,
    fontWeight: "600",
  },
  loginRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.xl,
  },
  loginText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  loginLink: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: "600",
  },
})

export default SignupScreen
