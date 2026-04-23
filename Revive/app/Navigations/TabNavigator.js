import { StyleSheet } from "react-native"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { MaterialCommunityIcons } from "@expo/vector-icons"
import MainScreen from "../Screens/MainScreen"
import DataDisplayScreen from "../Screens/DataDisplayScreen"
import OpportunityScannerScreen from "../Screens/OpportunityScannerScreen"
import AccountScreen from "../Screens/AccountScreen"
import { colors, borderRadius, shadows, spacing } from "../Styling/ModernLight"

const Tab = createBottomTabNavigator()

const TabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size, focused }) => {
          let iconName

          if (route.name === "Home") {
            iconName = "home"
          } else if (route.name === "Account") {
            iconName = "wallet"
          } else if (route.name === "Signals") {
            iconName = "flash"
          } else if (route.name === "Data") {
            iconName = "database"
          }

          return (
            <MaterialCommunityIcons
              name={iconName}
              size={focused ? size + 2 : size}
              color={focused ? colors.primary : colors.textTertiary}
            />
          )
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.divider,
          paddingTop: spacing.xs,
          paddingBottom: spacing.sm,
          height: 64,
          ...shadows.sm,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "500",
          marginTop: 2,
        },
        headerStyle: {
          backgroundColor: colors.card,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 1,
          borderBottomColor: colors.divider,
        },
        headerTitleStyle: {
          fontSize: 18,
          fontWeight: '600',
          color: colors.text,
        },
        headerTintColor: colors.text,
        headerShown: true,
      })}
    >
      {/* Main Trading Screen */}
      <Tab.Screen
        name="Home"
        component={MainScreen}
        options={{
          tabBarLabel: "Trading",
          headerTitle: "Trading",
        }}
      />

      {/* Opportunities Scanner Screen */}
      <Tab.Screen
        name="Signals"
        component={OpportunityScannerScreen}
        options={{
          tabBarLabel: "Signals",
          headerTitle: "Opportunities",
        }}
      />

      {/* Account Screen */}
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={{
          tabBarLabel: "Account",
          headerTitle: "My Account",
        }}
      />

      {/* Data Display Screen */}
      <Tab.Screen
        name="Data"
        component={DataDisplayScreen}
        options={{
          tabBarLabel: "History",
          headerTitle: "Trading History",
        }}
      />
    </Tab.Navigator>
  )
}

export default TabNavigator
