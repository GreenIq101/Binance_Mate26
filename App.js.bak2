"use client"

import { useState, useEffect } from "react"
import { StyleSheet, StatusBar } from "react-native"
import { Provider as PaperProvider, MD3LightTheme } from "react-native-paper"
import { createStackNavigator } from "@react-navigation/stack"
import { NavigationContainer, DefaultTheme } from "@react-navigation/native"
import "react-native-gesture-handler"
import Nav from "./app/Navigations/TabNavigator"
import EnteryNav from "./app/Navigations/EnteryNav"
import { onAuthStateChanged } from "firebase/auth"
import { auth } from "./app/Firebase/fireConfig"
import { colors } from "./app/Styling/ModernLight"

const Stack = createStackNavigator()

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.card,
    text: colors.text,
    border: colors.border,
  },
}

const paperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    secondary: colors.secondary,
    background: colors.background,
    surface: colors.surface,
  },
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsLoggedIn(true)
      } else {
        setIsLoggedIn(false)
      }
    })

    return () => unsubscribe()
  }, [])

  return (
    <PaperProvider theme={paperTheme}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <NavigationContainer theme={navigationTheme}>
        <Stack.Navigator>
          {isLoggedIn ? (
            <Stack.Screen options={{ headerShown: false }} name="Navigation" component={Nav} />
          ) : (
            <Stack.Screen options={{ headerShown: false }} name="EnteryNav" component={EnteryNav} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
})
