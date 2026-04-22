import React from "react"
import { View } from "react-native"

const tintBackgrounds = {
  light: "rgba(255, 255, 255, 0.72)",
  dark: "rgba(18, 18, 18, 0.72)",
  default: "rgba(255, 255, 255, 0.5)",
}

export const BlurView = ({ tint = "default", style, children, ...rest }) => {
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: tintBackgrounds[tint] || tintBackgrounds.default,
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}
