"use client"

import { useState, useEffect } from "react"
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar } from "react-native"
import { MaterialCommunityIcons } from "@expo/vector-icons"
import MLService from "../Services/MLService"
import { colors, spacing, borderRadius, shadows, typography } from "../Styling/ModernLight"

const EMAAnalysisScreen = () => {
  const [emaData, setEmaData] = useState([])
  const [mlPredictions, setMlPredictions] = useState([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  useEffect(() => {
    loadEMAData()
  }, [])

  const loadEMAData = async () => {
    // Simulate EMA data
    const mockEMAData = [
      {
        symbol: "BTCUSDT",
        price: 45000,
        ema12: 44800,
        ema26: 44500,
        signal: "bullish",
        strength: 0.75,
      },
      {
        symbol: "ETHUSDT",
        price: 3200,
        ema12: 3180,
        ema26: 3220,
        signal: "bearish",
        strength: 0.65,
      },
    ]

    setEmaData(mockEMAData)
    generateMLPredictions(mockEMAData)
  }

  const generateMLPredictions = async (data) => {
    const predictions = []

    for (const item of data) {
      const features = [
        item.price * 0.999,
        item.price * 1.001,
        item.price * 0.998,
        item.price,
        1000000,
        item.signal === "bullish" ? 65 : 35,
        ((item.ema12 - item.ema26) / item.price) * 100,
        item.ema12,
        item.ema26,
        item.price * 1.02,
        item.price * 0.98,
      ]

      const predictedPrice = await MLService.predict(features)

      predictions.push({
        ...item,
        mlPrediction: predictedPrice,
        mlSignal: predictedPrice > item.price ? "bullish" : "bearish",
        agreement: predictedPrice > item.price === (item.signal === "bullish"),
      })
    }

    setMlPredictions(predictions)
  }

  const analyzeWithML = async () => {
    setIsAnalyzing(true)

    // Simulate analysis delay
    await new Promise((resolve) => setTimeout(resolve, 2000))

    await generateMLPredictions(emaData)
    setIsAnalyzing(false)
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>EMA + ML Analysis</Text>
          <TouchableOpacity
            style={[styles.analyzeButton, isAnalyzing && styles.disabledButton]}
            onPress={analyzeWithML}
            disabled={isAnalyzing}
          >
            <MaterialCommunityIcons name={isAnalyzing ? "loading" : "brain"} size={20} color="white" />
            <Text style={styles.buttonText}>{isAnalyzing ? "Analyzing..." : "ML Analysis"}</Text>
          </TouchableOpacity>
        </View>

        {mlPredictions.map((item, index) => (
          <View key={index} style={styles.analysisCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.symbolText}>{item.symbol}</Text>
              <View style={styles.agreementIndicator}>
                <MaterialCommunityIcons
                  name={item.agreement ? "check-circle" : "alert-circle"}
                  size={20}
                  color={item.agreement ? "#10b981" : "#f59e0b"}
                />
                <Text style={[styles.agreementText, { color: item.agreement ? "#10b981" : "#f59e0b" }]}>
                  {item.agreement ? "Agreement" : "Divergence"}
                </Text>
              </View>
            </View>

            <View style={styles.priceSection}>
              <Text style={styles.currentPrice}>${item.price.toFixed(2)}</Text>
              <Text style={styles.priceLabel}>Current Price</Text>
            </View>

            <View style={styles.signalsSection}>
              <View style={styles.signalRow}>
                <Text style={styles.signalLabel}>EMA Signal:</Text>
                <View
                  style={[styles.signalBadge, { backgroundColor: item.signal === "bullish" ? "#10b981" : "#ef4444" }]}
                >
                  <Text style={styles.signalText}>{item.signal.toUpperCase()}</Text>
                </View>
              </View>

              <View style={styles.signalRow}>
                <Text style={styles.signalLabel}>ML Signal:</Text>
                <View
                  style={[styles.signalBadge, { backgroundColor: item.mlSignal === "bullish" ? "#10b981" : "#ef4444" }]}
                >
                  <Text style={styles.signalText}>{item.mlSignal.toUpperCase()}</Text>
                </View>
              </View>
            </View>

            <View style={styles.emaSection}>
              <View style={styles.emaRow}>
                <Text style={styles.emaLabel}>EMA 12:</Text>
                <Text style={styles.emaValue}>${item.ema12.toFixed(2)}</Text>
              </View>
              <View style={styles.emaRow}>
                <Text style={styles.emaLabel}>EMA 26:</Text>
                <Text style={styles.emaValue}>${item.ema26.toFixed(2)}</Text>
              </View>
              <View style={styles.emaRow}>
                <Text style={styles.emaLabel}>ML Prediction:</Text>
                <Text style={[styles.emaValue, { color: item.mlSignal === "bullish" ? "#10b981" : "#ef4444" }]}>
                  ${item.mlPrediction.toFixed(2)}
                </Text>
              </View>
            </View>

            <View style={styles.strengthSection}>
              <Text style={styles.strengthLabel}>Signal Strength</Text>
              <View style={styles.strengthBar}>
                <View
                  style={[
                    styles.strengthFill,
                    {
                      width: `${item.strength * 100}%`,
                      backgroundColor: item.strength > 0.7 ? "#10b981" : item.strength > 0.4 ? "#f59e0b" : "#ef4444",
                    },
                  ]}
                />
              </View>
              <Text style={styles.strengthText}>{(item.strength * 100).toFixed(0)}%</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
    padding: spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    ...shadows.sm,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.text,
  },
  analyzeButton: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  disabledButton: {
    backgroundColor: "#6b7280",
  },
  buttonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  analysisCard: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.3)",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  symbolText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "white",
  },
  agreementIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  agreementText: {
    fontSize: 12,
    fontWeight: "600",
  },
  priceSection: {
    alignItems: "center",
    marginBottom: 16,
  },
  currentPrice: {
    fontSize: 28,
    fontWeight: "bold",
    color: "white",
  },
  priceLabel: {
    fontSize: 12,
    color: "#9ca3af",
  },
  signalsSection: {
    marginBottom: 16,
  },
  signalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  signalLabel: {
    color: "#9ca3af",
    fontSize: 14,
  },
  signalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  signalText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  emaSection: {
    marginBottom: 16,
  },
  emaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  emaLabel: {
    color: "#9ca3af",
    fontSize: 14,
  },
  emaValue: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  strengthSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  strengthLabel: {
    color: "#9ca3af",
    fontSize: 12,
    width: 80,
  },
  strengthBar: {
    flex: 1,
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 3,
  },
  strengthFill: {
    height: "100%",
    borderRadius: 3,
  },
  strengthText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
    width: 30,
  },
})

export default EMAAnalysisScreen
