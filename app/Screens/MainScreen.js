"use client"

import { useState, useEffect } from "react"
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, StatusBar } from "react-native"
import { MaterialCommunityIcons } from "@expo/vector-icons"
import MLService from "../Services/MLService"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { colors, spacing, borderRadius, shadows, typography } from "../Styling/ModernLight"

const MainScreen = () => {
  const [predictions, setPredictions] = useState([])
  const [isTraining, setIsTraining] = useState(false)
  const [modelAccuracy, setModelAccuracy] = useState(null)
  const [marketData, setMarketData] = useState([])

  useEffect(() => {
    initializeML()
    loadMarketData()
  }, [])

  const initializeML = async () => {
    try {
      await MLService.initialize()
      const retrained = await MLService.checkAndRetrain()
      if (retrained) {
        Alert.alert("Success", "Model retrained with new data!")
      }
      calculateModelAccuracy()
    } catch (error) {
      console.error("Failed to initialize ML:", error)
    }
  }

  const loadMarketData = async () => {
    const mockData = [
      { symbol: "BTCUSDT", price: 45000, change: 2.5 },
      { symbol: "ETHUSDT", price: 3200, change: -1.2 },
      { symbol: "SOLUSDT", price: 185.50, change: 5.8 },
      { symbol: "BNBUSDT", price: 312.40, change: -0.5 },
    ]

    setMarketData(mockData)
    generatePredictions(mockData)
  }

  const generatePredictions = async (data) => {
    const newPredictions = []

    for (const item of data) {
      try {
        const features = [
          item.price * 0.999,
          item.price * 1.001,
          item.price * 0.998,
          item.price,
          1000000,
          50 + item.change,
          item.change * 0.1,
          item.price * 0.995,
          item.price * 1.005,
          item.price * 1.02,
          item.price * 0.98,
        ]

        const predictedPrice = await MLService.predict(features)

        const prediction = {
          symbol: item.symbol,
          currentPrice: item.price,
          predictedPrice: predictedPrice,
          confidence: Math.random() * 0.3 + 0.7,
          direction: predictedPrice > item.price ? "up" : "down",
          change: (((predictedPrice - item.price) / item.price) * 100).toFixed(2),
        }

        newPredictions.push(prediction)
        await MLService.savePrediction(item.symbol, item.price, predictedPrice, "price_prediction", features)
      } catch (error) {
        console.error(`Failed to generate prediction for ${item.symbol}:`, error)
      }
    }

    setPredictions(newPredictions)
  }

  const calculateModelAccuracy = async () => {
    try {
      const predictions = await AsyncStorage.getItem("predictions")
      if (predictions) {
        const parsedPredictions = JSON.parse(predictions)
        const accuratePredictions = parsedPredictions.filter((p) => p.accuracy !== null)

        if (accuratePredictions.length > 0) {
          const avgAccuracy = accuratePredictions.reduce((sum, p) => sum + p.accuracy, 0) / accuratePredictions.length
          setModelAccuracy((avgAccuracy * 100).toFixed(1))
        }
      }
    } catch (error) {
      console.error("Failed to calculate accuracy:", error)
    }
  }

  const retrainModel = async () => {
    try {
      setIsTraining(true)
      const trainingData = await MLService.getTrainingData()

      if (trainingData.length < 100) {
        Alert.alert("Insufficient Data", "Need at least 100 data points to retrain the model.")
        return
      }

      const success = await MLService.trainModel(trainingData)

      if (success) {
        Alert.alert("Success", "Model retrained successfully!")
        await generatePredictions(marketData)
        calculateModelAccuracy()
      } else {
        Alert.alert("Error", "Failed to retrain model.")
      }
    } catch (error) {
      console.error("Retraining failed:", error)
      Alert.alert("Error", "Retraining failed.")
    } finally {
      setIsTraining(false)
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header Card */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greeting}>Welcome back</Text>
              <Text style={styles.title}>AI Trading</Text>
            </View>
            <View style={styles.logoContainer}>
              <MaterialCommunityIcons name="brain" size={32} color={colors.primary} />
            </View>
          </View>

          {/* Accuracy Badge */}
          <View style={styles.accuracyBadge}>
            <MaterialCommunityIcons name="target" size={16} color={colors.success} />
            <Text style={styles.accuracyText}>
              Model: {modelAccuracy ? `${modelAccuracy}%` : "--"}
            </Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionButton, isTraining && styles.actionButtonDisabled]}
            onPress={retrainModel}
            disabled={isTraining}
          >
            <MaterialCommunityIcons 
              name={isTraining ? "loading" : "refresh"} 
              size={20} 
              color={colors.primary} 
            />
            <Text style={styles.actionText}>
              {isTraining ? "Training..." : "Retrain"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton}>
            <MaterialCommunityIcons name="chart-line" size={20} color={colors.primary} />
            <Text style={styles.actionText}>Analytics</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton}>
            <MaterialCommunityIcons name="bell-outline" size={20} color={colors.primary} />
            <Text style={styles.actionText}>Alerts</Text>
          </TouchableOpacity>
        </View>

        {/* AI Predictions Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI Predictions</Text>
          <Text style={styles.sectionSubtitle}>Based on technical analysis</Text>

          {predictions.map((prediction, index) => (
            <View key={index} style={styles.predictionCard}>
              <View style={styles.cardHeader}>
                <View style={styles.symbolContainer}>
                  <Text style={styles.symbolText}>{prediction.symbol}</Text>
                  <View style={[
                    styles.signalChip,
                    { 
                      backgroundColor: prediction.direction === "up" 
                        ? "#E6F4EA" 
                        : "#FCE8E6" 
                    }
                  ]}>
                    <MaterialCommunityIcons
                      name={prediction.direction === "up" ? "trending-up" : "trending-down"}
                      size={14}
                      color={prediction.direction === "up" ? colors.success : colors.danger}
                    />
                    <Text style={[
                      styles.signalText,
                      { 
                        color: prediction.direction === "up" 
                          ? colors.success 
                          : colors.danger 
                      }
                    ]}>
                      {prediction.direction === "up" ? "UP" : "DOWN"}
                    </Text>
                  </View>
                </View>
                <Text style={styles.confidenceLabel}>
                  {(prediction.confidence * 100).toFixed(0)}% conf
                </Text>
              </View>

              <View style={styles.priceRow}>
                <View style={styles.priceItem}>
                  <Text style={styles.priceLabel}>Current</Text>
                  <Text style={styles.priceValue}>${prediction.currentPrice.toLocaleString()}</Text>
                </View>
                <View style={styles.priceItem}>
                  <Text style={styles.priceLabel}>Predicted</Text>
                  <Text style={[
                    styles.predictedValue,
                    { 
                      color: prediction.direction === "up" 
                        ? colors.success 
                        : colors.danger 
                    }
                  ]}>
                    ${prediction.predictedPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </Text>
                </View>
                <View style={styles.priceItem}>
                  <Text style={styles.priceLabel}>Change</Text>
                  <Text style={[
                    styles.changeValue,
                    { 
                      color: prediction.direction === "up" 
                        ? colors.success 
                        : colors.danger 
                    }
                  ]}>
                    {prediction.change}%
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Market Overview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Market Overview</Text>
          <Text style={styles.sectionSubtitle}>Top cryptocurrencies</Text>

          {marketData.map((item, index) => (
            <View key={index} style={styles.marketCard}>
              <Text style={styles.marketSymbol}>{item.symbol}</Text>
              <Text style={styles.marketPrice}>${item.price.toLocaleString()}</Text>
              <View style={[
                styles.changeBadge,
                { 
                  backgroundColor: item.change >= 0 
                    ? "#E6F4EA" 
                    : "#FCE8E6" 
                }
              ]}>
                <Text style={[
                  styles.changeBadgeText,
                  { 
                    color: item.change >= 0 
                      ? colors.success 
                      : colors.danger 
                  }
                ]}>
                  {item.change >= 0 ? "+" : ""}{item.change}%
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.bottomSpacer} />
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
  headerCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greeting: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  logoContainer: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceVariant,
    justifyContent: "center",
    alignItems: "center",
  },
  accuracyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: "#E6F4EA",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
    alignSelf: "flex-start",
  },
  accuracyText: {
    ...typography.caption,
    color: colors.success,
    fontWeight: "600",
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceVariant,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionText: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: "500",
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.h5,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    ...typography.caption,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  predictionCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  symbolContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  symbolText: {
    ...typography.h6,
    color: colors.text,
  },
  signalChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
  },
  signalText: {
    ...typography.caption,
    fontWeight: "600",
  },
  confidenceLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  priceItem: {
    flex: 1,
  },
  priceLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    marginBottom: 2,
  },
  priceValue: {
    ...typography.body,
    color: colors.text,
    fontWeight: "600",
  },
  predictedValue: {
    ...typography.body,
    fontWeight: "600",
  },
  changeValue: {
    ...typography.body,
    fontWeight: "600",
  },
  marketCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  marketSymbol: {
    ...typography.body,
    color: colors.text,
    fontWeight: "600",
    flex: 1,
  },
  marketPrice: {
    ...typography.body,
    color: colors.text,
    fontWeight: "600",
    flex: 1,
    textAlign: "center",
  },
  changeBadge: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
  },
  changeBadgeText: {
    ...typography.caption,
    fontWeight: "600",
  },
  bottomSpacer: {
    height: spacing.xl,
  },
})

export default MainScreen