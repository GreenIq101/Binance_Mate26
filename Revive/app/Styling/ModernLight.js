// Modern Light Theme - Google Material Design 3 Inspired
// Clean, minimal, light mode design

export const colors = {
  // Primary Google colors
  primary: '#4285F4',      // Google Blue
  secondary: '#34A853',    // Google Green
  tertiary: '#FBBC04',    // Google Yellow
  error: '#EA4335',      // Google Red
  
  // Light theme palette
  background: '#FFFFFF',
  surface: '#F8F9FA',
  surfaceVariant: '#E8EAED',
  card: '#FFFFFF',
  
  // Text colors
  text: '#202124',
  textSecondary: '#5F6368',
  textTertiary: '#9AA0A6',
  textInverse: '#FFFFFF',
  
  // Border & Divider
  border: '#DADCE0',
  divider: '#E8EAED',
  
  // Status colors
  success: '#34A853',
  warning: '#FBBC04',
  info: '#4285F4',
  danger: '#EA4335',
  
  // Signal colors
  signalBuy: '#34A853',
  signalSell: '#EA4335',
  signalHold: '#FBBC04',
  
  // Overlay for dark backgrounds when needed
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.1)',
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
}

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
}

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
}

export const typography = {
  // Headings - Google Sans style
  h1: {
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 36,
    letterSpacing: -0.25,
  },
  h3: {
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 32,
  },
  h4: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 28,
  },
  h5: {
    fontSize: 18,
    fontWeight: '500',
    lineHeight: 24,
  },
  h6: {
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 22,
  },
  
  // Body text
  body: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },
  overline: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
}

// Common container styles
export const containers = {
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  section: {
    marginBottom: spacing.lg,
  },
}

// Common button styles
export const buttons = {
  primary: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: {
    backgroundColor: colors.surfaceVariant,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outline: {
    backgroundColor: 'transparent',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
}

// Input styles
export const inputs = {
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  focused: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
}

// Chip/Tag styles (for signals, etc)
export const chips = {
  container: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
  },
  buy: {
    backgroundColor: '#E6F4EA',
  },
  sell: {
    backgroundColor: '#FCE8E6',
  },
  hold: {
    backgroundColor: '#FEF7E0',
  },
}

// Header/Nav styles
export const header = {
  background: colors.card,
  borderBottomWidth: 1,
  borderBottomColor: colors.divider,
}

// Tab bar styles  
export const tabBar = {
  background: colors.card,
  borderTopWidth: 1,
  borderTopColor: colors.divider,
  activeColor: colors.primary,
  inactiveColor: colors.textTertiary,
}