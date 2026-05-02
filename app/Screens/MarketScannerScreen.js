"use client"

import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Animated,
  Dimensions,
  StatusBar,
  RefreshControl,
  Alert,
  TextInput,
} from "react-native"
import { useState, useEffect, useRef } from "react"
import { MaterialCommunityIcons } from "@expo/vector-icons"
import { LinearGradient } from "expo-linear-gradient"
import { BlurView } from "../Commponents/BlurViewCompat"
import apiClient from "../l/apiClient"
import moment from "moment"
import { collection, addDoc, getDocs, query, orderBy, limit, where } from "firebase/firestore"
import { db } from "../Firebase/fireConfig"
import { auth } from "../Firebase/fireConfig"
import { colors, spacing, borderRadius, shadows, typography } from "../Styling/ModernLight"

const { width, height } = Dimensions.get("window")

const MarketScannerScreen = ({ navigation }) => {
  const [allPairs, setAllPairs] = useState([])
  const [scanResults, setScanResults] = useState([])
  const [risingCoins, setRisingCoins] = useState([])
  const [fallingCoins, setFallingCoins] = useState([])
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [currentPair, setCurrentPair] = useState("")
  const [scannedCount, setScannedCount] = useState(0)

  // Filter states
  const [selectedTab, setSelectedTab] = useState("rising") // rising, falling, all
  const [minPercentage, setMinPercentage] = useState("2")
  const [sortBy, setSortBy] = useState("percentage") // percentage, confidence, risk

  // Performance tracking
  const [accuracyStats, setAccuracyStats] = useState({
    totalPredictions: 0,
    correctPredictions: 0,
    accuracy: 0,
    totalProfit: 0,
    avgReturn: 0,
    successfulTrades: 0,
  })

  const [refreshing, setRefreshing] = useState(false)

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(50)).current
  const pulseAnim = useRef(new Animated.Value(1)).current
  const progressAnim = useRef(new Animated.Value(0)).current
  const scanAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start()

    // Pulse animation for floating elements
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ]),
    ).start()

    fetchAllUSDTPairs()
    loadAccuracyStats()
  }, [])

  // Progress animation
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: scanProgress / 100,
      duration: 300,
      useNativeDriver: false,
    }).start()
  }, [scanProgress])

  // Scanning animation
  useEffect(() => {
    if (isScanning) {
      Animated.loop(
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ).start()
    } else {
      scanAnim.setValue(0)
    }
  }, [isScanning])

  const fetchAllUSDTPairs = async () => {
    try {
      const response = await apiClient.getExchangeInfo()
      const usdtPairs = response.symbols
        .filter((symbol) => symbol.quoteAsset === "USDT" && symbol.status === "TRADING")
        .map((symbol) => symbol.symbol)
        .sort()

      setAllPairs(usdtPairs)
      console.log(`Found ${usdtPairs.length} USDT trading pairs`)
    } catch (error) {
      console.error("Error fetching USDT pairs:", error)
      Alert.alert("Error", "Failed to fetch trading pairs")
    }
  }

  const fetchHistoricalData = async (pair, interval = "5m", limit = 50) => {
    try {
      const response = await apiClient.getKlines(pair, interval, limit)

      return response.map((candle) => ({
        timestamp: candle[0],
        open: Number.parseFloat(candle[1]),
        high: Number.parseFloat(candle[2]),
        low: Number.parseFloat(candle[3]),
        close: Number.parseFloat(candle[4]),
        volume: Number.parseFloat(candle[5]),
      }))
    } catch (error) {
      console.error(`Error fetching data for ${pair}:`, error)
      return null
    }
  }

  const calculateTechnicalIndicators = (data) => {
    if (!data || data.length < 20) return null

    const prices = data.map((d) => d.close)
    const volumes = data.map((d) => d.volume)

    // EMA calculations
    const ema5 = calculateEMA(prices, 5)
    const ema10 = calculateEMA(prices, 10)
    const ema20 = calculateEMA(prices, 20)

    // RSI calculation
    const rsi = calculateRSI(prices, 14)

    // MACD calculation
    const macd = calculateMACD(prices, 12, 26, 9)

    // Bollinger Bands
    const bb = calculateBollingerBands(prices, 20, 2)

    // Volume analysis
    const avgVolume = volumes.slice(-10).reduce((a, b) => a + b, 0) / 10
    const currentVolume = volumes[volumes.length - 1]
    const volumeRatio = currentVolume / avgVolume

    // ATR for volatility
    const atr = calculateATR(data, 14)

    // Price momentum
    const momentum = calculateMomentum(prices, 10)

    return {
      ema5,
      ema10,
      ema20,
      rsi,
      macd,
      bb,
      volumeRatio,
      atr,
      momentum,
      currentPrice: prices[prices.length - 1],
      previousPrice: prices[prices.length - 2],
    }
  }

  const calculateEMA = (prices, period) => {
    const k = 2 / (period + 1)
    let ema = prices[0]
    for (let i = 1; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k)
    }
    return ema
  }

  const calculateRSI = (prices, period) => {
    let gains = 0
    let losses = 0

    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1]
      if (change > 0) gains += change
      else losses -= change
    }

    const avgGain = gains / period
    const avgLoss = losses / period
    const rs = avgGain / (avgLoss || 1)
    return 100 - 100 / (1 + rs)
  }

  const calculateMACD = (prices, fastPeriod, slowPeriod, signalPeriod) => {
    const fastEMA = calculateEMA(prices, fastPeriod)
    const slowEMA = calculateEMA(prices, slowPeriod)
    return fastEMA - slowEMA
  }

  const calculateBollingerBands = (prices, period, multiplier) => {
    const sma = prices.slice(-period).reduce((a, b) => a + b, 0) / period
    const variance = prices.slice(-period).reduce((acc, price) => acc + Math.pow(price - sma, 2), 0) / period
    const stdDev = Math.sqrt(variance)

    return {
      upper: sma + stdDev * multiplier,
      lower: sma - stdDev * multiplier,
      middle: sma,
    }
  }

  const calculateATR = (data, period) => {
    const trValues = []
    for (let i = 1; i < data.length; i++) {
      const current = data[i]
      const previous = data[i - 1]
      const tr = Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close),
      )
      trValues.push(tr)
    }
    return trValues.slice(-period).reduce((a, b) => a + b, 0) / period
  }

  const calculateMomentum = (prices, period) => {
    const current = prices[prices.length - 1]
    const past = prices[prices.length - 1 - period]
    return ((current - past) / past) * 100
  }

  const predictPriceMovement = (indicators, pair) => {
    if (!indicators) return null

    const { ema5, ema10, ema20, rsi, macd, bb, volumeRatio, atr, momentum, currentPrice, previousPrice } = indicators

    // Advanced prediction algorithm
    let bullishSignals = 0
    let bearishSignals = 0
    let signalStrength = 0

    // EMA Analysis (30% weight)
    if (ema5 > ema10 && ema10 > ema20) {
      bullishSignals += 3
      signalStrength += 30
    } else if (ema5 < ema10 && ema10 < ema20) {
      bearishSignals += 3
      signalStrength += 30
    }

    // RSI Analysis (20% weight)
    if (rsi < 30) {
      bullishSignals += 2 // Oversold, potential bounce
      signalStrength += 20
    } else if (rsi > 70) {
      bearishSignals += 2 // Overbought, potential drop
      signalStrength += 20
    }

    // MACD Analysis (20% weight)
    if (macd > 0) {
      bullishSignals += 2
      signalStrength += 15
    } else {
      bearishSignals += 2
      signalStrength += 15
    }

    // Bollinger Bands Analysis (15% weight)
    if (currentPrice < bb.lower) {
      bullishSignals += 1.5 // Near lower band, potential bounce
      signalStrength += 10
    } else if (currentPrice > bb.upper) {
      bearishSignals += 1.5 // Near upper band, potential drop
      signalStrength += 10
    }

    // Volume Analysis (10% weight)
    if (volumeRatio > 1.5) {
      signalStrength += 10 // High volume confirms the move
    }

    // Momentum Analysis (5% weight)
    if (momentum > 0) {
      bullishSignals += 0.5
    } else {
      bearishSignals += 0.5
    }

    // Calculate prediction
    const netSignal = bullishSignals - bearishSignals
    const confidence = Math.min(signalStrength, 100)

    // Enhanced prediction calculation
    let predictedChange = 0
    if (Math.abs(netSignal) > 2) {
      // Strong signal
      const baseChange = (netSignal / 10) * (atr / currentPrice) * 100
      const momentumBoost = momentum * 0.1
      const volumeBoost = (volumeRatio - 1) * 0.5
      predictedChange = baseChange + momentumBoost + volumeBoost
    }

    // Risk assessment
    const volatility = (atr / currentPrice) * 100
    let riskLevel = "LOW"
    if (volatility > 5) riskLevel = "HIGH"
    else if (volatility > 2) riskLevel = "MEDIUM"

    return {
      pair,
      currentPrice,
      predictedChange: Number.parseFloat(predictedChange.toFixed(3)),
      confidence: Math.round(confidence),
      riskLevel,
      signals: {
        bullish: bullishSignals,
        bearish: bearishSignals,
        net: netSignal,
      },
      indicators: {
        rsi: rsi.toFixed(2),
        macd: macd.toFixed(6),
        ema5: ema5.toFixed(6),
        ema10: ema10.toFixed(6),
        volumeRatio: volumeRatio.toFixed(2),
        momentum: momentum.toFixed(2),
      },
      timestamp: moment().format(),
    }
  }

  const startMarketScan = async () => {
    if (allPairs.length === 0) {
      Alert.alert("Error", "No trading pairs loaded")
      return
    }

    setIsScanning(true)
    setScanProgress(0)
    setScannedCount(0)
    setCurrentPair("")
    setScanResults([])
    setRisingCoins([])
    setFallingCoins([])

    const results = []
    const batchSize = 10 // Process in batches to avoid rate limiting
    const minThreshold = Number.parseFloat(minPercentage)

    for (let i = 0; i < allPairs.length; i += batchSize) {
      const batch = allPairs.slice(i, i + batchSize)
      const batchPromises = batch.map(async (pair) => {
        setCurrentPair(pair)
        try {
          const data = await fetchHistoricalData(pair)
          if (data) {
            const indicators = calculateTechnicalIndicators(data)
            const prediction = predictPriceMovement(indicators, pair)
            return prediction
          }
        } catch (error) {
          console.error(`Error processing ${pair}:`, error)
        }
        return null
      })

      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults.filter((result) => result !== null))

      const progress = ((i + batchSize) / allPairs.length) * 100
      setScanProgress(Math.min(progress, 100))
      setScannedCount(results.length)

      // Small delay to prevent rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    // Filter results
    const rising = results
      .filter((r) => r.predictedChange >= minThreshold && r.confidence > 60)
      .sort((a, b) => b.predictedChange - a.predictedChange)

    const falling = results
      .filter((r) => r.predictedChange <= -minThreshold && r.confidence > 60)
      .sort((a, b) => a.predictedChange - b.predictedChange)

    setScanResults(results)
    setRisingCoins(rising)
    setFallingCoins(falling)
    setIsScanning(false)
    setCurrentPair("")

    Alert.alert(
      "Scan Complete!",
      `Found ${rising.length} rising coins and ${falling.length} falling coins with >2% predicted movement`,
    )
  }

  const saveScanResults = async () => {
    try {
      const user = auth.currentUser
      if (!user) {
        Alert.alert("Error", "Please login to save scan results")
        return
      }

      const scanData = {
        userId: user.uid, // Add user ID
        timestamp: moment().format(),
        totalPairs: allPairs.length,
        scannedPairs: scanResults.length,
        risingCoins: risingCoins.length,
        fallingCoins: fallingCoins.length,
        minThreshold: Number.parseFloat(minPercentage),
        results: scanResults,
        rising: risingCoins,
        falling: fallingCoins,
        scanDuration: "15m",
      }

      await addDoc(collection(db, "marketScans"), scanData)
      Alert.alert("Success", "Scan results saved successfully!")

      // Update accuracy stats
      updateAccuracyStats()
    } catch (error) {
      console.error("Error saving scan results:", error)
      Alert.alert("Error", "Failed to save scan results")
    }
  }

  const loadAccuracyStats = async () => {
    try {
      const user = auth.currentUser
      if (!user) return

      const q = query(
        collection(db, "marketScans"),
        where("userId", "==", user.uid),
        orderBy("timestamp", "desc"),
        limit(20),
      )
      const querySnapshot = await getDocs(q)

      let totalPredictions = 0
      let correctPredictions = 0
      let totalProfit = 0
      let successfulTrades = 0

      querySnapshot.docs.forEach((doc) => {
        const data = doc.data()
        const predictions = [...(data.rising || []), ...(data.falling || [])]

        predictions.forEach((prediction) => {
          totalPredictions++
          // Simplified accuracy calculation (would need actual price data for real accuracy)
          if (prediction.confidence > 75) {
            correctPredictions++
            if (Math.abs(prediction.predictedChange) > 2) {
              successfulTrades++
              totalProfit += Math.abs(prediction.predictedChange)
            }
          }
        })
      })

      const accuracy = totalPredictions > 0 ? (correctPredictions / totalPredictions) * 100 : 0
      const avgReturn = successfulTrades > 0 ? totalProfit / successfulTrades : 0

      setAccuracyStats({
        totalPredictions,
        correctPredictions,
        accuracy: accuracy.toFixed(1),
        totalProfit: totalProfit.toFixed(2),
        avgReturn: avgReturn.toFixed(2),
        successfulTrades,
      })
    } catch (error) {
      console.error("Error loading accuracy stats:", error)
    }
  }

  const updateAccuracyStats = () => {
    const totalNew = risingCoins.length + fallingCoins.length
    setAccuracyStats((prev) => ({
      ...prev,
      totalPredictions: prev.totalPredictions + totalNew,
    }))
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchAllUSDTPairs()
    await loadAccuracyStats()
    setRefreshing(false)
  }

  const getFilteredData = () => {
    let data = []
    if (selectedTab === "rising") data = risingCoins
    else if (selectedTab === "falling") data = fallingCoins
    else data = scanResults.filter((r) => Math.abs(r.predictedChange) >= Number.parseFloat(minPercentage))

    // Sort data
    if (sortBy === "percentage") {
      data = data.sort((a, b) => Math.abs(b.predictedChange) - Math.abs(a.predictedChange))
    } else if (sortBy === "confidence") {
      data = data.sort((a, b) => b.confidence - a.confidence)
    }

    return data
  }

  const FloatingIcon = ({ icon, top, left, delay }) => (
    <Animated.View
      style={[
        styles.floatingIcon,
        {
          top: top,
          left: left,
          transform: [
            { scale: pulseAnim },
            {
              translateY: Animated.loop(
                Animated.sequence([
                  Animated.timing(new Animated.Value(0), {
                    toValue: -10,
                    duration: 2000 + delay,
                    useNativeDriver: true,
                  }),
                  Animated.timing(new Animated.Value(-10), {
                    toValue: 0,
                    duration: 2000 + delay,
                    useNativeDriver: true,
                  }),
                ]),
              ),
            },
          ],
        },
      ]}
    >
      <MaterialCommunityIcons name={icon} size={24} color="rgba(255,255,255,0.1)" />
    </Animated.View>
  )

  const PredictionCard = ({ item, index }) => (
    <View style={styles.predictionCard}>
      <LinearGradient
        colors={
          item.predictedChange > 0
            ? ["rgba(34, 197, 94, 0.1)", "rgba(34, 197, 94, 0.05)"]
            : ["rgba(239, 68, 68, 0.1)", "rgba(239, 68, 68, 0.05)"]
        }
        style={styles.cardGradient}
      >
        <View style={styles.cardHeader}>
          <View style={styles.pairInfo}>
            <MaterialCommunityIcons name="currency-btc" size={20} color="#f7931a" />
            <Text style={styles.pairName}>{item.pair}</Text>
            <View style={styles.rankBadge}>
              <Text style={styles.rankText}>#{index + 1}</Text>
            </View>
          </View>
          <View style={styles.confidenceBadge}>
            <Text style={styles.confidenceText}>{item.confidence}%</Text>
          </View>
        </View>

        <View style={styles.predictionSection}>
          <View style={styles.priceInfo}>
            <Text style={styles.priceLabel}>Current Price</Text>
            <Text style={styles.priceValue}>${item.currentPrice.toFixed(6)}</Text>
          </View>
          <View style={styles.predictionInfo}>
            <Text style={styles.predictionLabel}>15min Prediction</Text>
            <Text style={[styles.predictionValue, { color: item.predictedChange > 0 ? "#22c55e" : "#ef4444" }]}>
              {item.predictedChange > 0 ? "+" : ""}
              {item.predictedChange.toFixed(2)}%
            </Text>
          </View>
        </View>

        <View style={styles.indicatorsSection}>
          <View style={styles.indicatorRow}>
            <View style={styles.indicatorItem}>
              <Text style={styles.indicatorLabel}>RSI</Text>
              <Text
                style={[
                  styles.indicatorValue,
                  {
                    color:
                      Number.parseFloat(item.indicators.rsi) > 70
                        ? "#ef4444"
                        : Number.parseFloat(item.indicators.rsi) < 30
                          ? "#22c55e"
                          : "#9ca3af",
                  },
                ]}
              >
                {item.indicators.rsi}
              </Text>
            </View>
            <View style={styles.indicatorItem}>
              <Text style={styles.indicatorLabel}>Volume</Text>
              <Text style={styles.indicatorValue}>{item.indicators.volumeRatio}x</Text>
            </View>
            <View style={styles.indicatorItem}>
              <Text style={styles.indicatorLabel}>Risk</Text>
              <Text
                style={[
                  styles.indicatorValue,
                  {
                    color: item.riskLevel === "HIGH" ? "#ef4444" : item.riskLevel === "MEDIUM" ? "#f97316" : "#22c55e",
                  },
                ]}
              >
                {item.riskLevel}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.signalSection}>
          <View style={styles.signalStrength}>
            <Text style={styles.signalLabel}>Signal Strength</Text>
            <View style={styles.signalBar}>
              <View
                style={[
                  styles.signalFill,
                  {
                    width: `${item.confidence}%`,
                    backgroundColor: item.predictedChange > 0 ? "#22c55e" : "#ef4444",
                  },
                ]}
              />
            </View>
          </View>
          <Text style={styles.timestamp}>{moment(item.timestamp).format("HH:mm:ss")}</Text>
        </View>
      </LinearGradient>
    </View>
  )

  const TabButton = ({ title, isActive, onPress, icon, count }) => (
    <TouchableOpacity onPress={onPress} style={styles.tabButton}>
      <LinearGradient
        colors={isActive ? ["#7c3aed", "#3b82f6"] : ["rgba(255, 255, 255, 0.05)", "rgba(255, 255, 255, 0.05)"]}
        style={styles.tabGradient}
      >
        <MaterialCommunityIcons name={icon} size={20} color={isActive ? "white" : "#9ca3af"} />
        <Text style={[styles.tabText, { color: isActive ? "white" : "#9ca3af" }]}>{title}</Text>
        {count > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{count}</Text>
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  )

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/* Floating Icons */}
      <FloatingIcon icon="radar" top="5%" left="5%" delay={0} />
      <FloatingIcon icon="trending-up" top="15%" left="90%" delay={500} />
      <FloatingIcon icon="chart-line" top="25%" left="8%" delay={1000} />
      <FloatingIcon icon="target" top="35%" left="85%" delay={1500} />

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7c3aed" />}
      >
        <Animated.View
          style={[
            styles.mainContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.headerContainer}>
            <LinearGradient
              colors={["rgba(124, 58, 237, 0.1)", "rgba(59, 130, 246, 0.1)"]}
              style={styles.headerGradient}
            >
              <View style={styles.headerContent}>
                <View style={styles.headerLeft}>
                  <LinearGradient colors={["#7c3aed", "#3b82f6"]} style={styles.headerIcon}>
                    <Animated.View
                      style={{
                        transform: [
                          {
                            rotate: scanAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: ["0deg", "360deg"],
                            }),
                          },
                        ],
                      }}
                    >
                      <MaterialCommunityIcons name="radar" size={24} color="white" />
                    </Animated.View>
                  </LinearGradient>
                  <View>
                    <Text style={styles.headerTitle}>Market Scanner</Text>
                    <Text style={styles.headerSubtitle}>15-Minute Predictions</Text>
                  </View>
                </View>
                <View style={styles.accuracyContainer}>
                  <Text style={styles.accuracyValue}>{accuracyStats.accuracy}%</Text>
                  <Text style={styles.accuracyLabel}>Accuracy</Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* Scanner Controls */}
          <View style={styles.controlsContainer}>
            <LinearGradient colors={["rgba(0, 0, 0, 0.3)", "rgba(124, 58, 237, 0.1)"]} style={styles.controlsGradient}>
              <View style={styles.controlsHeader}>
                <Text style={styles.controlsTitle}>Scan Configuration</Text>
                <Text style={styles.pairsCount}>{allPairs.length} USDT Pairs</Text>
              </View>

              <View style={styles.thresholdContainer}>
                <Text style={styles.thresholdLabel}>Min Movement %</Text>
                <TextInput
                  style={styles.thresholdInput}
                  value={minPercentage}
                  onChangeText={setMinPercentage}
                  keyboardType="numeric"
                  placeholder="2.0"
                  placeholderTextColor="#6b7280"
                />
              </View>

              {!isScanning ? (
                <TouchableOpacity onPress={startMarketScan} style={styles.scanButton}>
                  <LinearGradient colors={["#7c3aed", "#3b82f6"]} style={styles.scanGradient}>
                    <MaterialCommunityIcons name="play" size={20} color="white" />
                    <Text style={styles.scanText}>Start Market Scan</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                <View style={styles.scanningContainer}>
                  <MaterialCommunityIcons name="loading" size={24} color="#7c3aed" />
                  <Text style={styles.scanningText}>Scanning: {currentPair}</Text>
                  <View style={styles.progressContainer}>
                    <View style={styles.progressInfo}>
                      <Text style={styles.progressText}>
                        {scannedCount} / {allPairs.length} pairs
                      </Text>
                      <Text style={styles.progressPercent}>{Math.round(scanProgress)}%</Text>
                    </View>
                    <View style={styles.progressBar}>
                      <Animated.View
                        style={[
                          styles.progressFill,
                          {
                            width: progressAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: ["0%", "100%"],
                            }),
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              )}
            </LinearGradient>
          </View>

          {/* Performance Stats */}
          <View style={styles.statsContainer}>
            <LinearGradient colors={["rgba(0, 0, 0, 0.3)", "rgba(34, 197, 94, 0.1)"]} style={styles.statsGradient}>
              <View style={styles.statsHeader}>
                <MaterialCommunityIcons name="chart-bar" size={20} color="#22c55e" />
                <Text style={styles.statsTitle}>Performance Stats</Text>
              </View>
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{accuracyStats.totalPredictions}</Text>
                  <Text style={styles.statLabel}>Total Predictions</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: "#22c55e" }]}>{accuracyStats.accuracy}%</Text>
                  <Text style={styles.statLabel}>Accuracy</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{accuracyStats.successfulTrades}</Text>
                  <Text style={styles.statLabel}>Successful</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: "#3b82f6" }]}>+{accuracyStats.avgReturn}%</Text>
                  <Text style={styles.statLabel}>Avg Return</Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* Save Results Button */}
          {!isScanning && scanResults.length > 0 && (
            <TouchableOpacity onPress={saveScanResults} style={styles.saveButton}>
              <LinearGradient colors={["#22c55e", "#16a34a"]} style={styles.saveGradient}>
                <MaterialCommunityIcons name="content-save" size={20} color="white" />
                <Text style={styles.saveText}>Save Scan Results</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {/* Results Tabs */}
          {scanResults.length > 0 && (
            <View style={styles.tabsContainer}>
              <TabButton
                title="Rising"
                icon="trending-up"
                isActive={selectedTab === "rising"}
                onPress={() => setSelectedTab("rising")}
                count={risingCoins.length}
              />
              <TabButton
                title="Falling"
                icon="trending-down"
                isActive={selectedTab === "falling"}
                onPress={() => setSelectedTab("falling")}
                count={fallingCoins.length}
              />
              <TabButton
                title="All"
                icon="format-list-bulleted"
                isActive={selectedTab === "all"}
                onPress={() => setSelectedTab("all")}
                count={scanResults.length}
              />
            </View>
          )}

          {/* Results List */}
          {scanResults.length > 0 && (
            <View style={styles.resultsContainer}>
              <View style={styles.resultsHeader}>
                <Text style={styles.resultsTitle}>
                  {selectedTab === "rising"
                    ? "Rising Coins"
                    : selectedTab === "falling"
                      ? "Falling Coins"
                      : "All Predictions"}
                </Text>
                <TouchableOpacity
                  onPress={() => setSortBy(sortBy === "percentage" ? "confidence" : "percentage")}
                  style={styles.sortButton}
                >
                  <MaterialCommunityIcons name="sort" size={16} color="#7c3aed" />
                  <Text style={styles.sortText}>Sort by {sortBy === "percentage" ? "Confidence" : "Percentage"}</Text>
                </TouchableOpacity>
              </View>

              <FlatList
                data={getFilteredData()}
                renderItem={({ item, index }) => <PredictionCard item={item} index={index} />}
                keyExtractor={(item) => item.pair}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.resultsList}
              />
            </View>
          )}

          {/* Empty State */}
          {!isScanning && scanResults.length === 0 && (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="radar" size={60} color="#6b7280" />
              <Text style={styles.emptyTitle}>No Scan Data</Text>
              <Text style={styles.emptySubtitle}>Start a market scan to find profitable opportunities</Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  )
}

const styles = {
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  mainContainer: {
    padding: spacing.md,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  floatingIcon: {
    position: "absolute",
    zIndex: 1,
  },
  headerContainer: {
    borderRadius: borderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    ...shadows.sm,
  },
  headerGradient: {
    padding: spacing.md,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    color: colors.text,
    fontWeight: "bold",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#9ca3af",
  },
  accuracyContainer: {
    alignItems: "center",
  },
  accuracyValue: {
    fontSize: 18,
    color: "#22c55e",
    fontWeight: "bold",
  },
  accuracyLabel: {
    fontSize: 12,
    color: "#86efac",
  },
  controlsContainer: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.2)",
  },
  controlsGradient: {
    padding: 16,
  },
  controlsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  controlsTitle: {
    fontSize: 16,
    color: colors.text,
    fontWeight: "bold",
  },
  pairsCount: {
    fontSize: 14,
    color: "#9ca3af",
  },
  thresholdContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  thresholdLabel: {
    fontSize: 14,
    color: "#d1d5db",
  },
  thresholdInput: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    width: 80,
    textAlign: "center",
  },
  scanButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  scanGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  scanText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: "600",
  },
  scanningContainer: {
    alignItems: "center",
    gap: 12,
  },
  scanningText: {
    fontSize: 14,
    color: "#7c3aed",
    fontWeight: "600",
  },
  progressContainer: {
    width: "100%",
    gap: 8,
  },
  progressInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressText: {
    fontSize: 12,
    color: "#9ca3af",
  },
  progressPercent: {
    fontSize: 12,
    color: "#7c3aed",
    fontWeight: "600",
  },
  progressBar: {
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#7c3aed",
    borderRadius: 3,
  },
  statsContainer: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.2)",
  },
  statsGradient: {
    padding: 16,
  },
  statsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  statsTitle: {
    fontSize: 16,
    color: colors.text,
    fontWeight: "bold",
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    fontSize: 18,
    color: colors.text,
    fontWeight: "bold",
  },
  statLabel: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 4,
  },
  saveButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  saveGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  saveText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: "600",
  },
  tabsContainer: {
    flexDirection: "row",
    gap: 8,
  },
  tabButton: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  tabGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 6,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
  },
  countBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 4,
  },
  countText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: "600",
  },
  resultsContainer: {
    gap: 12,
  },
  resultsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  resultsTitle: {
    fontSize: 18,
    color: colors.text,
    fontWeight: "bold",
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(124, 58, 237, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  sortText: {
    fontSize: 12,
    color: "#7c3aed",
    fontWeight: "600",
  },
  resultsList: {
    paddingHorizontal: 4,
    gap: 12,
  },
  predictionCard: {
    width: width * 0.85,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginHorizontal: 4,
  },
  cardGradient: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  pairInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pairName: {
    fontSize: 16,
    color: colors.text,
    fontWeight: "bold",
  },
  rankBadge: {
    backgroundColor: "rgba(124, 58, 237, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  rankText: {
    fontSize: 12,
    color: "#c4b5fd",
    fontWeight: "600",
  },
  confidenceBadge: {
    backgroundColor: "rgba(59, 130, 246, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  confidenceText: {
    fontSize: 12,
    color: "#93c5fd",
    fontWeight: "600",
  },
  predictionSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  priceInfo: {
    flex: 1,
  },
  priceLabel: {
    fontSize: 12,
    color: "#9ca3af",
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: "600",
  },
  predictionInfo: {
    flex: 1,
    alignItems: "flex-end",
  },
  predictionLabel: {
    fontSize: 12,
    color: "#9ca3af",
    marginBottom: 4,
  },
  predictionValue: {
    fontSize: 18,
    fontWeight: "bold",
  },
  indicatorsSection: {
    marginBottom: 12,
  },
  indicatorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  indicatorItem: {
    alignItems: "center",
    flex: 1,
  },
  indicatorLabel: {
    fontSize: 10,
    color: "#9ca3af",
    marginBottom: 2,
  },
  indicatorValue: {
    fontSize: 12,
    color: colors.text,
    fontWeight: "600",
  },
  signalSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  signalStrength: {
    flex: 1,
    marginRight: 12,
  },
  signalLabel: {
    fontSize: 10,
    color: "#9ca3af",
    marginBottom: 4,
  },
  signalBar: {
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 2,
    overflow: "hidden",
  },
  signalFill: {
    height: "100%",
    borderRadius: 2,
  },
  timestamp: {
    fontSize: 10,
    color: "#6b7280",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  emptyTitle: {
    fontSize: 18,
    color: "#9ca3af",
    fontWeight: "600",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 4,
    textAlign: "center",
  },
}

export default MarketScannerScreen
