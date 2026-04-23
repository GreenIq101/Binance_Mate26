"use client"

import { useState, useEffect } from "react"
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
import { auth } from "../Firebase/fireConfig"
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup } from "firebase/auth"
import { colors, spacing, borderRadius, shadows, typography } from "../Styling/ModernLight"

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [emailValid, setEmailValid] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)

  useEffect(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    setEmailValid(emailRegex.test(email))
  }, [email])

  const handleLogin = async () => {
    if (!emailValid || !password) {
      Alert.alert("Error", "Please enter valid email and password")
      return
    }

    setIsLoading(true)
    try {
      const normalizedEmail = email.trim().toLowerCase()
      await signInWithEmailAndPassword(auth, normalizedEmail, password)
    } catch (error) {
      console.error("Login error:", error)
      let errorMessage = "Login failed. Please try again."

      if (error.code === "auth/user-not-found") {
        errorMessage = "No account found with this email."
      } else if (error.code === "auth/wrong-password") {
        errorMessage = "Incorrect password."
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "Invalid email address."
      } else if (error.code === "auth/invalid-credential") {
        errorMessage = "Invalid email or password."
      } else if (error.code === "auth/too-many-requests") {
        errorMessage = "Too many attempts. Please wait a few minutes and try again."
      } else if (error.code === "auth/network-request-failed") {
        errorMessage = "Network error. Check your internet connection and try again."
      }

      Alert.alert("Login Error", errorMessage)
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
            <MaterialCommunityIcons name="brain" size={40} color={colors.primary} />
          </View>
          <Text style={styles.appName}>Binance Mate</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>
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
                placeholder="Enter password"
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

          <View style={styles.optionsRow}>
            <TouchableOpacity 
              style={styles.rememberRow} 
              onPress={() => setRememberMe(!rememberMe)}
            >
              <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                {rememberMe && <MaterialCommunityIcons name="check" size={12} color="white" />}
              </View>
              <Text style={styles.rememberText}>Remember me</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => Alert.alert("Coming Soon", "Password reset is not implemented yet.")}>
              <Text style={styles.forgotText}>Forgot?</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.loginButton, (!emailValid || !password || isLoading) && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={!emailValid || !password || isLoading}
          >
            <View style={styles.buttonContent}>
              {isLoading ? (
                <MaterialCommunityIcons name="loading" size={20} color="white" />
              ) : (
                <View style={styles.buttonContent}>
                  <MaterialCommunityIcons name="login" size={20} color="white" />
                  <Text style={styles.loginButtonText}>Sign In</Text>
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

          <View style={styles.signupRow}>
            <Text style={styles.signupText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate("Signup")}>
              <Text style={styles.signupLink}>Sign Up</Text>
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
  optionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
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
  rememberText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  forgotText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: "500",
  },
  loginButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    overflow: "hidden",
  },
  loginButtonDisabled: {
    backgroundColor: colors.textTertiary,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  loginButtonText: {
    ...typography.body,
    color: "white",
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
  signupRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.xl,
  },
  signupText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  signupLink: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: "600",
  },
})

export default LoginScreen
