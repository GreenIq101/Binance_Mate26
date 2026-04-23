import { StyleSheet } from "react-native"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { MaterialCommunityIcons } from "@expo/vector-icons"
import { LinearGradient } from "expo-linear-gradient"
import { BlurView } from "../Commponents/BlurViewCompat"
import LoginScreen from "../Screens/LoginScreen"
import SignupScreen from "../Screens/SignupScreen"

const Tab = createBottomTabNavigator()

const EnteryNav = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size, focused }) => {
          let iconName

          if (route.name === "Login") {
            iconName = "account-lock-open"
          } else if (route.name === "Signup") {
            iconName = "account-plus"
          }

          // Return the corresponding icon component with enhanced styling
          return (
            <LinearGradient
              colors={focused ? ["#7c3aed", "#3b82f6"] : ["transparent", "transparent"]}
              style={[styles.iconContainer, focused && styles.iconContainerActive]}
            >
              <MaterialCommunityIcons
                name={iconName}
                size={focused ? size + 2 : size}
                color={focused ? "white" : color}
              />
            </LinearGradient>
          )
        },
        tabBarActiveTintColor: "#7c3aed",
        tabBarInactiveTintColor: "#6b7280",
        tabBarStyle: {
          backgroundColor: "rgba(15, 23, 42, 0.95)",
          borderTopWidth: 1,
          borderTopColor: "rgba(124, 58, 237, 0.2)",
          paddingTop: 8,
          paddingBottom: 8,
          height: 70,
        },
        tabBarBackground: () => <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
          marginTop: 4,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen
        name="Login"
        component={LoginScreen}
        options={{
          tabBarLabel: "Sign In",
        }}
      />
      <Tab.Screen
        name="Signup"
        component={SignupScreen}
        options={{
          tabBarLabel: "Sign Up",
        }}
      />
    </Tab.Navigator>
  )
}

export default EnteryNav

const styles = StyleSheet.create({
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  iconContainerActive: {
    shadowColor: "#7c3aed",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
})
