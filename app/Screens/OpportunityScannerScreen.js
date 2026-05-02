"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  TextInput,
  Animated,
  Dimensions,
  Easing,
  Alert,
} from "react-native"
import { MaterialCommunityIcons } from "@expo/vector-icons"
import { ref, push, set, get, update } from "firebase/database"
import { colors, spacing, borderRadius, shadows, typography } from "../Styling/ModernLight"
import apiClient from "../l/apiClient"
import { auth, rtdb } from "../Firebase/fireConfig"

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window")
const DEFAULT_TRADE_NOTIONAL_USDT = 100

const formatPriceFull = (value) => {
  const n = Number.parseFloat(value || 0)
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 9, maximumFractionDigits: 9 })}`
}

const formatUsdt = (value) => {
  const n = Number.parseFloat(value || 0)
  const sign = n > 0 ? "+" : ""
  return `${sign}$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const formatDate = (ms) => new Date(ms).toLocaleString()

const calculateEMA = (values, period) => {
  if (!values || values.length < period) return null
  const k = 2 / (period + 1)
  let ema = values[0]
  for (let i = 1; i < values.length; i++) ema = values[i] * k + ema * (1 - k)
  return ema
}

const calculateRSI = (values, period = 14) => {
  if (!values || values.length <= period) return null
  let gains = 0
  let losses = 0
  for (let i = values.length - period; i < values.length; i++) {
    const change = values[i] - values[i - 1]
    if (change > 0) gains += change
    else losses -= change
  }
  if (losses === 0) return 100
  const rs = gains / losses
  return 100 - 100 / (1 + rs)
}

const calculateATR = (candles, period = 14) => {
  if (!candles || candles.length <= period) return null
  const tr = []
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i]
    const prev = candles[i - 1]
    const hl = current.high - current.low
    const hc = Math.abs(current.high - prev.close)
    const lc = Math.abs(current.low - prev.close)
    tr.push(Math.max(hl, hc, lc))
  }
  const recent = tr.slice(-period)
  return recent.reduce((sum, v) => sum + v, 0) / period
}

const parseKlines = (klines) =>
  (klines || []).map((k) => ({
    open: Number.parseFloat(k[1]),
    high: Number.parseFloat(k[2]),
    low: Number.parseFloat(k[3]),
    close: Number.parseFloat(k[4]),
    volume: Number.parseFloat(k[5]),
  }))

const buildSignal = (symbol, candles) => {
  if (!candles || candles.length < 60) return null

  const closes = candles.map((c) => c.close)
  const volumes = candles.map((c) => c.volume)
  const last = closes[closes.length - 1]
  const prev7 = closes[Math.max(0, closes.length - 7)]

  const ema9 = calculateEMA(closes, 9)
  const ema21 = calculateEMA(closes, 21)
  const ema50 = calculateEMA(closes, 50)
  const rsi = calculateRSI(closes, 14)
  const atr = calculateATR(candles, 14)

  if (!ema9 || !ema21 || !ema50 || !rsi || !atr || !last) return null

  const atrPct = (atr / last) * 100
  const momentumPct = ((last - prev7) / prev7) * 100
  const avgVol20 = volumes.slice(-20).reduce((sum, v) => sum + v, 0) / 20
  const volRatio = avgVol20 > 0 ? volumes[volumes.length - 1] / avgVol20 : 1

  const shortTrendPct = ((ema9 - ema21) / last) * 100
  const longTrendPct = ((ema21 - ema50) / last) * 100
  const rsiBias = rsi < 35 ? 0.85 : rsi > 65 ? -0.85 : (50 - rsi) / 22
  const volumeBias = clamp((volRatio - 1) * 0.55, -0.7, 0.9)
  const momentumBias = clamp(momentumPct * 0.12, -0.8, 0.8)

  const forecastScore = clamp(shortTrendPct * 3.2 + longTrendPct * 2.1 + rsiBias + volumeBias + momentumBias, -2.5, 2.5)
  const direction = forecastScore >= 0 ? "RISE" : "FALL"
  const confidence = Math.round(clamp((Math.abs(forecastScore) / 2.5) * 100, 20, 99))

  const reasons = []
  reasons.push(ema9 > ema21 ? "EMA9 above EMA21 (short trend bullish)" : "EMA9 below EMA21 (short trend bearish)")
  reasons.push(ema21 > ema50 ? "EMA21 above EMA50 (structure supportive)" : "EMA21 below EMA50 (structure weak)")
  if (rsi < 35) reasons.push("RSI in oversold zone (reversal potential)")
  else if (rsi > 65) reasons.push("RSI in overbought zone (pullback risk)")
  else reasons.push("RSI neutral (trend continuation setup)")
  reasons.push(volRatio >= 1 ? "Volume above average (signal confirmation)" : "Volume below average (weaker conviction)")
  reasons.push(momentumPct >= 0 ? "Recent momentum positive" : "Recent momentum negative")

  let horizonMinutes = 60
  if (confidence >= 75 && atrPct >= 0.8) horizonMinutes = 15
  else if (confidence >= 60) horizonMinutes = 30

  const horizonScale = Math.sqrt(horizonMinutes / 15)
  const projectedVolatility = atrPct * horizonScale * 0.72
  const directionalStrength = Math.abs(forecastScore) / 2.5
  const expectedGainPct = Number.parseFloat(clamp(projectedVolatility * directionalStrength + 0.25, 0.2, 18).toFixed(2))

  const entryPrice = last
  const exitPrice = direction === "RISE" ? entryPrice * (1 + expectedGainPct / 100) : entryPrice * (1 - expectedGainPct / 100)
  const stopPct = Math.max(atrPct * 0.6, expectedGainPct * 0.45, 0.25)
  const stopPrice = direction === "RISE" ? entryPrice * (1 - stopPct / 100) : entryPrice * (1 + stopPct / 100)

  return {
    signalId: `${symbol}-${Date.now()}`,
    symbol,
    direction,
    confidence,
    expectedGainPct,
    horizonMinutes,
    currentPrice: last,
    entryPrice,
    exitPrice,
    stopPrice,
    confidenceSummary: reasons.join(" • "),
    createdAt: new Date().toISOString(),
    indicators: { ema9, ema21, ema50, rsi, atrPct, momentumPct, volRatio },
  }
}

const computeTradeClose = (trade, currentPrice) => {
  const entry = Number.parseFloat(trade.entryPrice)
  const exit = Number.parseFloat(currentPrice)
  const notional = Number.parseFloat(trade.notionalUsdt || DEFAULT_TRADE_NOTIONAL_USDT)
  const direction = trade.direction

  const pnlPercent =
    direction === "RISE" ? ((exit - entry) / entry) * 100 : ((entry - exit) / entry) * 100

  const profitAmount = (notional * pnlPercent) / 100

  let closeReason = "TIME_EXPIRY"
  if (direction === "RISE" && exit >= trade.targetPrice) closeReason = "TARGET_HIT"
  else if (direction === "RISE" && exit <= trade.stopPrice) closeReason = "STOP_HIT"
  else if (direction === "FALL" && exit <= trade.targetPrice) closeReason = "TARGET_HIT"
  else if (direction === "FALL" && exit >= trade.stopPrice) closeReason = "STOP_HIT"

  return {
    status: "CLOSED",
    exitPrice: Number.parseFloat(exit.toFixed(9)),
    pnlPercent: Number.parseFloat(pnlPercent.toFixed(4)),
    profitAmount: Number.parseFloat(profitAmount.toFixed(4)),
    outcome: pnlPercent >= 0 ? "WIN" : "LOSS",
    closeReason,
    closedAt: Date.now(),
  }
}

// Retry logic for API calls
const getTickerWithRetry = async (symbol, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await apiClient.getTicker(symbol)
    } catch (error) {
      if (i === retries - 1) throw error
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
    }
  }
}

const FallingPairTag = ({ item, onFinish }) => {
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: item.duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => onFinish(item.id))
  }, [item.duration, item.id, onFinish, progress])

  const opacity = progress.interpolate({
    inputRange: [0, 0.1, 0.88, 0.96, 1],
    outputRange: [0, 1, 1, 0.95, 0],
  })
  const translateY = progress.interpolate({
    inputRange: [0, 0.88, 1],
    outputRange: [-80, item.dropDistance, item.dropDistance + 8],
  })
  const translateX = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, item.driftX * 0.5, item.driftX],
  })
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", `${item.rotateDeg}deg`],
  })
  const backgroundColor = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: item.colors,
  })

  return (
    <Animated.View
      style={[
        styles.fallingChip,
        { left: item.left, opacity, backgroundColor, transform: [{ translateY }, { translateX }, { rotate }] },
      ]}
    >
      <MaterialCommunityIcons name={item.direction === "FALL" ? "trending-down" : "trending-up"} size={12} color="white" />
      <Text style={styles.fallingChipText}>{item.symbol}</Text>
    </Animated.View>
  )
}

const OpportunityScannerScreen = () => {
  const [allPairs, setAllPairs] = useState([])
  const [signals, setSignals] = useState([])
  const [trades, setTrades] = useState([])
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [scannedCount, setScannedCount] = useState(0)
  const [currentPair, setCurrentPair] = useState("")
  const [minConfidenceInput, setMinConfidenceInput] = useState("55")
  const [errorMessage, setErrorMessage] = useState("")
  const [fallingPairs, setFallingPairs] = useState([])
  const [isEvaluatingTrades, setIsEvaluatingTrades] = useState(false)
  const [lastAlertHash, setLastAlertHash] = useState({}) // Prevent duplicate alerts

  useEffect(() => {
    loadPairs()
    refreshTradesAndEvaluate()

    // Monitor every 5 seconds for target/stop hits
    const interval = setInterval(() => {
      refreshTradesAndEvaluate()
      monitorOpenTrades()
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  const minConfidence = useMemo(() => {
    const n = Number.parseInt(minConfidenceInput, 10)
    if (Number.isNaN(n)) return 55
    return clamp(n, 1, 100)
  }, [minConfidenceInput])

  const filteredSignals = useMemo(() => signals.filter((s) => s.confidence >= minConfidence), [signals, minConfidence])

  const tradeStats = useMemo(() => {
    const closed = trades.filter((t) => t.status === "CLOSED")
    const open = trades.filter((t) => t.status === "OPEN")
    const wins = closed.filter((t) => Number.parseFloat(t.pnlPercent || 0) > 0).length
    const totalProfit = closed.reduce((sum, t) => sum + Number.parseFloat(t.profitAmount || 0), 0)
    const accuracy = closed.length ? (wins / closed.length) * 100 : 0
    return {
      total: trades.length,
      open: open.length,
      closed: closed.length,
      wins,
      accuracy,
      totalProfit,
    }
  }, [trades])

  const loadPairs = async () => {
    try {
      setErrorMessage("")
      const exchangeInfo = await apiClient.getExchangeInfo()
      const pairs = (exchangeInfo?.symbols || [])
        .filter((s) => s.quoteAsset === "USDT" && s.status === "TRADING")
        .map((s) => s.symbol)
        .sort()
      setAllPairs(pairs)
    } catch (error) {
      console.error("Failed to load USDT pairs:", error)
      setErrorMessage(error?.message || "Failed to load pairs")
    }
  }

  const spawnFallingPair = (symbol, direction = "RISE") => {
    const palette =
      direction === "FALL"
        ? ["rgba(239,68,68,0.88)", "rgba(249,115,22,0.88)", "rgba(236,72,153,0.88)"]
        : ["rgba(34,197,94,0.88)", "rgba(59,130,246,0.88)", "rgba(20,184,166,0.88)"]

    const chip = {
      id: `${symbol}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      symbol,
      direction,
      left: Math.max(4, Math.random() * (SCREEN_WIDTH - 130)),
      driftX: Math.random() * 90 - 45,
      rotateDeg: Math.random() * 26 - 13,
      dropDistance: SCREEN_HEIGHT * (0.32 + Math.random() * 0.28),
      duration: 2200 + Math.floor(Math.random() * 2200),
      colors: palette,
    }

    setFallingPairs((prev) => [...prev.slice(-42), chip])
  }

  const removeFallingPair = (id) => setFallingPairs((prev) => prev.filter((chip) => chip.id !== id))

  const loadTrades = async () => {
    const user = auth.currentUser
    if (!user) {
      setTrades([])
      return
    }

    const userTradesRef = ref(rtdb, `signalTrades/${user.uid}`)
    const snapshot = await get(userTradesRef)
    if (!snapshot.exists()) {
      setTrades([])
      return
    }

    const data = snapshot.val()
    const parsed = Object.keys(data).map((id) => ({ id, ...data[id] }))
    parsed.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    setTrades(parsed)
  }

  // Monitor open trades for target/stop hits in real-time
  const monitorOpenTrades = async () => {
    const user = auth.currentUser
    if (!user) return

    try {
      const userTradesRef = ref(rtdb, `signalTrades/${user.uid}`)
      const snapshot = await get(userTradesRef)
      if (!snapshot.exists()) return

      const data = snapshot.val()
      const openTrades = Object.keys(data)
        .map((id) => ({ id, ...data[id] }))
        .filter((trade) => trade.status === "OPEN")

      if (openTrades.length === 0) return

      // Get current prices for all open trades in parallel
      const pricePromises = openTrades.map(async (trade) => {
        try {
          const ticker = await getTickerWithRetry(trade.symbol)
          return {
            tradeId: trade.id,
            symbol: trade.symbol,
            currentPrice: Number.parseFloat(ticker?.price || 0),
            trade: trade
          }
        } catch (error) {
          console.error(`Failed to get price for ${trade.symbol}:`, error)
          return null
        }
      })

      const priceResults = await Promise.all(pricePromises)
      const updates = []

      for (const result of priceResults) {
        if (!result || !result.currentPrice) continue
        
        const { tradeId, currentPrice, trade } = result
        const entry = Number.parseFloat(trade.entryPrice)
        const target = Number.parseFloat(trade.targetPrice)
        const stop = Number.parseFloat(trade.stopPrice)
        const direction = trade.direction
        
        let shouldClose = false
        let closeReason = ""
        
        // Check if target or stop hit
        if (direction === "RISE") {
          if (currentPrice >= target) {
            shouldClose = true
            closeReason = "TARGET_HIT"
          } else if (currentPrice <= stop) {
            shouldClose = true
            closeReason = "STOP_HIT"
          }
        } else { // FALL
          if (currentPrice <= target) {
            shouldClose = true
            closeReason = "TARGET_HIT"
          } else if (currentPrice >= stop) {
            shouldClose = true
            closeReason = "STOP_HIT"
          }
        }
        
        // Also check if expired
        const now = Date.now()
        const isExpired = now >= Number.parseInt(trade.expiresAt || 0, 10)
        
        if ((shouldClose || isExpired) && !trade.closedAt) {
          const closePayload = computeTradeClose(trade, currentPrice)
          closePayload.closeReason = shouldClose ? closeReason : "TIME_EXPIRY"
          updates.push(
            update(ref(rtdb, `signalTrades/${user.uid}/${tradeId}`), closePayload)
          )
          
          // Show alert for target/stop hits (with deduplication)
          if (shouldClose) {
            const pnl = closePayload.pnlPercent
            const emoji = pnl >= 0 ? "🎯" : "🛑"
            const alertKey = `${tradeId}-${closeReason}`
            
            if (!lastAlertHash[alertKey]) {
              setLastAlertHash(prev => ({ ...prev, [alertKey]: true }))
              Alert.alert(
                `${emoji} Trade Closed - ${trade.symbol}`,
                `${direction} ${closeReason === "TARGET_HIT" ? "TARGET" : "STOP"} hit!\nPnL: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}% (${formatUsdt(closePayload.profitAmount)})`
              )
            }
          }
        }
      }
      
      if (updates.length > 0) {
        await Promise.all(updates)
        await loadTrades() // Refresh trades after updates
      }
    } catch (error) {
      console.error("Trade monitoring failed:", error)
    }
  }

  const evaluateOpenTrades = async () => {
    const user = auth.currentUser
    if (!user) return

    setIsEvaluatingTrades(true)
    try {
      const userTradesRef = ref(rtdb, `signalTrades/${user.uid}`)
      const snapshot = await get(userTradesRef)
      if (!snapshot.exists()) return

      const data = snapshot.val()
      const openTrades = Object.keys(data)
        .map((id) => ({ id, ...data[id] }))
        .filter((trade) => trade.status === "OPEN" && !trade.closedAt)

      for (const trade of openTrades) {
        try {
          const ticker = await getTickerWithRetry(trade.symbol)
          const currentPrice = Number.parseFloat(ticker?.price || 0)
          if (!currentPrice) continue

          const now = Date.now()
          const isExpired = now >= Number.parseInt(trade.expiresAt || 0, 10)
          
          // Check if target/stop hit or expired
          const entry = Number.parseFloat(trade.entryPrice)
          const target = Number.parseFloat(trade.targetPrice)
          const stop = Number.parseFloat(trade.stopPrice)
          const direction = trade.direction
          
          let shouldClose = isExpired
          let closeReason = "TIME_EXPIRY"
          
          if (!shouldClose) {
            if (direction === "RISE") {
              if (currentPrice >= target) {
                shouldClose = true
                closeReason = "TARGET_HIT"
              } else if (currentPrice <= stop) {
                shouldClose = true
                closeReason = "STOP_HIT"
              }
            } else {
              if (currentPrice <= target) {
                shouldClose = true
                closeReason = "TARGET_HIT"
              } else if (currentPrice >= stop) {
                shouldClose = true
                closeReason = "STOP_HIT"
              }
            }
          }
          
          if (shouldClose) {
            const closePayload = computeTradeClose(trade, currentPrice)
            closePayload.closeReason = closeReason
            await update(ref(rtdb, `signalTrades/${user.uid}/${trade.id}`), closePayload)
          }
        } catch (error) {
          console.error(`Failed evaluating trade ${trade.id}:`, error)
        }
      }
    } finally {
      setIsEvaluatingTrades(false)
    }
  }

  const refreshTradesAndEvaluate = async () => {
    try {
      await evaluateOpenTrades()
      await loadTrades()
    } catch (error) {
      console.error("Trade refresh/evaluation failed:", error)
    }
  }

  const takeTrade = async (signal) => {
    const user = auth.currentUser
    if (!user) {
      Alert.alert("Login Required", "Please login first to save and track trades.")
      return
    }

    try {
      const now = Date.now()
      const tradeData = {
        userId: user.uid,
        signalId: signal.signalId,
        symbol: signal.symbol,
        direction: signal.direction,
        confidence: signal.confidence,
        entryPrice: Number.parseFloat(signal.entryPrice.toFixed(9)),
        targetPrice: Number.parseFloat(signal.exitPrice.toFixed(9)),
        stopPrice: Number.parseFloat(signal.stopPrice.toFixed(9)),
        expectedGainPct: signal.expectedGainPct,
        horizonMinutes: signal.horizonMinutes,
        status: "OPEN",
        notionalUsdt: DEFAULT_TRADE_NOTIONAL_USDT,
        createdAt: now,
        expiresAt: now + signal.horizonMinutes * 60 * 1000,
        exitPrice: null,
        pnlPercent: null,
        profitAmount: null,
        closedAt: null,
        closeReason: null,
      }

      const newTradeRef = push(ref(rtdb, `signalTrades/${user.uid}`))
      await set(newTradeRef, tradeData)

      const signalRef = push(ref(rtdb, `signals/${user.uid}`))
      await set(signalRef, {
        userId: user.uid,
        ...signal,
        createdAt: now,
      })

      await loadTrades()
      Alert.alert("Trade Saved", `${signal.symbol} ${signal.direction} trade has been saved. Will auto-close on target/stop/expiry.`)
    } catch (error) {
      console.error("Failed to save trade:", error)
      Alert.alert("Save Failed", error?.message || "Could not save trade.")
    }
  }

  const scanAllPairs = async () => {
    if (!allPairs.length) return

    setIsScanning(true)
    setErrorMessage("")
    setSignals([])
    setScanProgress(0)
    setScannedCount(0)
    setCurrentPair("")

    const collected = []
    const chunkSize = 8

    try {
      for (let i = 0; i < allPairs.length; i += chunkSize) {
        const chunk = allPairs.slice(i, i + chunkSize)

        const results = await Promise.allSettled(
          chunk.map(async (symbol) => {
            setCurrentPair(symbol)
            const klines = await apiClient.getKlines(symbol, "5m", 120)
            const candles = parseKlines(klines)
            return buildSignal(symbol, candles)
          }),
        )

        results.forEach((r, index) => {
          const symbol = chunk[index]
          if (r.status === "fulfilled" && r.value) {
            collected.push(r.value)
            spawnFallingPair(symbol, r.value.direction)
          } else {
            spawnFallingPair(symbol, Math.random() > 0.5 ? "RISE" : "FALL")
          }
        })

        const done = Math.min(i + chunk.length, allPairs.length)
        setScannedCount(done)
        setScanProgress(Math.round((done / allPairs.length) * 100))
      }

      const sorted = collected.sort((a, b) => b.confidence * b.expectedGainPct - a.confidence * a.expectedGainPct)
      setSignals(sorted)
    } catch (error) {
      console.error("Scan failed:", error)
      setErrorMessage(error?.message || "Scan failed")
    } finally {
      setCurrentPair("")
      setIsScanning(false)
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <View style={styles.rainLayer} pointerEvents="none">
        {fallingPairs.map((item) => (
          <FallingPairTag key={item.id} item={item} onFinish={removeFallingPair} />
        ))}
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.title}>Short Trade Opportunities</Text>
              <Text style={styles.subtitle}>Forecasted next-move scanner for USDT pairs</Text>
            </View>
            <MaterialCommunityIcons name="radar" size={32} color={colors.primary} />
          </View>

          <View style={styles.controlsRow}>
            <View style={styles.inputWrap}>
              <Text style={styles.inputLabel}>Min Confidence %</Text>
              <TextInput
                value={minConfidenceInput}
                onChangeText={setMinConfidenceInput}
                keyboardType="numeric"
                style={styles.input}
                placeholder="55"
                placeholderTextColor={colors.textTertiary}
              />
            </View>

            <TouchableOpacity style={[styles.scanButton, isScanning && styles.scanButtonDisabled]} onPress={scanAllPairs} disabled={isScanning}>
              <MaterialCommunityIcons name={isScanning ? "loading" : "play"} size={18} color={colors.textInverse} />
              <Text style={styles.scanButtonText}>{isScanning ? "Scanning..." : "Scan All"}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Pairs</Text>
              <Text style={styles.metricValue}>{allPairs.length}</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Scanned</Text>
              <Text style={styles.metricValue}>{scannedCount}</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Progress</Text>
              <Text style={styles.metricValue}>{scanProgress}%</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Signals</Text>
              <Text style={styles.metricValue}>{filteredSignals.length}</Text>
            </View>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Trades</Text>
              <Text style={styles.metricValue}>{tradeStats.total}</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Open</Text>
              <Text style={styles.metricValue}>{tradeStats.open}</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Accuracy</Text>
              <Text style={styles.metricValue}>{tradeStats.accuracy.toFixed(1)}%</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={[styles.metricValue, { color: tradeStats.totalProfit >= 0 ? colors.success : colors.error }]}>
                {formatUsdt(tradeStats.totalProfit)}
              </Text>
              <Text style={styles.metricLabel}>Realized PnL</Text>
            </View>
          </View>

          {!!currentPair && <Text style={styles.currentPair}>Analyzing: {currentPair}</Text>}
          {isEvaluatingTrades && <Text style={styles.currentPair}>Evaluating trades...</Text>}
          {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Top Opportunities</Text>
          <Text style={styles.sectionSub}>Forecasted move for next horizon (not past move)</Text>
        </View>

        {filteredSignals.length === 0 ? (
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name="chart-line" size={36} color={colors.textTertiary} />
            <Text style={styles.emptyText}>{isScanning ? "Scanning market..." : "Press Scan All to discover opportunities"}</Text>
          </View>
        ) : (
          filteredSignals.slice(0, 120).map((item, index) => {
            const up = item.direction === "RISE"
            return (
              <View key={`${item.signalId}-${index}`} style={styles.signalCard}>
                <View style={styles.signalHeader}>
                  <View style={styles.symbolWrap}>
                    <Text style={styles.symbol}>{item.symbol}</Text>
                    <View style={[styles.directionChip, { backgroundColor: up ? "#E6F4EA" : "#FCE8E6" }]}>
                      <MaterialCommunityIcons name={up ? "trending-up" : "trending-down"} size={14} color={up ? colors.success : colors.error} />
                      <Text style={[styles.directionText, { color: up ? colors.success : colors.error }]}>{item.direction}</Text>
                    </View>
                  </View>
                  <Text style={styles.confidence}>{item.confidence}%</Text>
                </View>

                <View style={styles.signalRow}>
                  <Text style={styles.signalLabel}>Forecast Gain</Text>
                  <Text style={[styles.signalValue, { color: up ? colors.success : colors.error }]}>
                    {up ? "+" : "-"}
                    {item.expectedGainPct}%
                  </Text>
                </View>
                <View style={styles.signalRow}>
                  <Text style={styles.signalLabel}>Horizon</Text>
                  <Text style={styles.signalValue}>{item.horizonMinutes}m</Text>
                </View>
                <View style={styles.signalRow}>
                  <Text style={styles.signalLabel}>Price</Text>
                  <Text style={styles.signalValue}>{formatPriceFull(item.currentPrice)}</Text>
                </View>
                <View style={styles.signalRow}>
                  <Text style={styles.signalLabel}>Entry</Text>
                  <Text style={styles.signalValue}>{formatPriceFull(item.entryPrice)}</Text>
                </View>
                <View style={styles.signalRow}>
                  <Text style={styles.signalLabel}>Target</Text>
                  <Text style={[styles.signalValue, { color: up ? colors.success : colors.error }]}>{formatPriceFull(item.exitPrice)}</Text>
                </View>
                <View style={styles.signalRow}>
                  <Text style={styles.signalLabel}>Stop</Text>
                  <Text style={styles.signalValue}>{formatPriceFull(item.stopPrice)}</Text>
                </View>

                <Text style={styles.reasonText}>{item.confidenceSummary}</Text>

                <TouchableOpacity style={styles.tradeButton} onPress={() => takeTrade(item)}>
                  <MaterialCommunityIcons name="lightning-bolt" size={16} color={colors.textInverse} />
                  <Text style={styles.tradeButtonText}>Take Trade ({DEFAULT_TRADE_NOTIONAL_USDT} USDT)</Text>
                </TouchableOpacity>
              </View>
            )
          })
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Trades</Text>
          <Text style={styles.sectionSub}>Saved from signals, auto-evaluated at expiry</Text>
        </View>

        {trades.length === 0 ? (
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name="history" size={36} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No trades yet. Save one from a signal.</Text>
          </View>
        ) : (
          trades.slice(0, 30).map((trade) => (
            <View key={trade.id} style={styles.tradeCard}>
              <View style={styles.tradeHead}>
                <Text style={styles.tradeSymbol}>{trade.symbol}</Text>
                <Text style={[styles.tradeStatus, { color: trade.status === "OPEN" ? colors.primary : trade.outcome === "WIN" ? colors.success : colors.error }]}>
                  {trade.status}
                </Text>
              </View>
              <Text style={styles.tradeMeta}>
                {trade.direction} • {trade.horizonMinutes}m • {formatDate(trade.createdAt)}
              </Text>
              <View style={styles.signalRow}>
                <Text style={styles.signalLabel}>Entry</Text>
                <Text style={styles.signalValue}>{formatPriceFull(trade.entryPrice)}</Text>
              </View>
              <View style={styles.signalRow}>
                <Text style={styles.signalLabel}>Target</Text>
                <Text style={styles.signalValue}>{formatPriceFull(trade.targetPrice)}</Text>
              </View>
               <View style={styles.signalRow}>
                 <Text style={styles.signalLabel}>Stop</Text>
                 <Text style={styles.signalValue}>{formatPriceFull(trade.stopPrice)}</Text>
               </View>
              {trade.status === "CLOSED" && (
                <>
                  <View style={styles.signalRow}>
                    <Text style={styles.signalLabel}>Exit</Text>
                    <Text style={styles.signalValue}>{formatPriceFull(trade.exitPrice)}</Text>
                  </View>
                  <View style={styles.signalRow}>
                    <Text style={styles.signalLabel}>Close Reason</Text>
                    <Text style={[styles.signalValue, { color: trade.closeReason === "TARGET_HIT" ? colors.success : trade.closeReason === "STOP_HIT" ? colors.error : colors.textSecondary }]}>
                      {trade.closeReason?.replace("_", " ")}
                    </Text>
                  </View>
                  <View style={styles.signalRow}>
                    <Text style={styles.signalLabel}>PnL %</Text>
                    <Text style={[styles.signalValue, { color: Number.parseFloat(trade.pnlPercent || 0) >= 0 ? colors.success : colors.error }]}>
                      {Number.parseFloat(trade.pnlPercent || 0).toFixed(3)}%
                    </Text>
                  </View>
                  <View style={styles.signalRow}>
                    <Text style={styles.signalLabel}>Profit</Text>
                    <Text style={[styles.signalValue, { color: Number.parseFloat(trade.profitAmount || 0) >= 0 ? colors.success : colors.error }]}>
                      {formatUsdt(trade.profitAmount || 0)}
                    </Text>
                  </View>
                </>
              )}
            </View>
          ))
        )}

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
  rainLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    overflow: "hidden",
  },
  fallingChip: {
    position: "absolute",
    top: -40,
    minWidth: 76,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    ...shadows.sm,
  },
  fallingChipText: {
    ...typography.caption,
    color: colors.textInverse,
    fontWeight: "700",
  },
  headerCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md,
    marginBottom: spacing.md,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h5,
    color: colors.text,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  controlsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-end",
    marginBottom: spacing.md,
  },
  inputWrap: {
    flex: 1,
  },
  inputLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  scanButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  scanButtonDisabled: {
    opacity: 0.65,
  },
  scanButtonText: {
    ...typography.bodySmall,
    color: colors.textInverse,
    fontWeight: "600",
  },
  metricsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  metricBox: {
    flex: 1,
    backgroundColor: colors.surfaceVariant,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  metricLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  metricValue: {
    ...typography.body,
    color: colors.text,
    fontWeight: "600",
  },
  currentPair: {
    ...typography.bodySmall,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.error,
    marginTop: spacing.xs,
  },
  sectionHeader: {
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.h6,
    color: colors.text,
  },
  sectionSub: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  emptyBox: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: "center",
  },
  signalCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
    marginBottom: spacing.sm,
  },
  signalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  symbolWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  symbol: {
    ...typography.h6,
    color: colors.text,
  },
  directionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  directionText: {
    ...typography.caption,
    fontWeight: "700",
  },
  confidence: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: "700",
  },
  signalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  signalLabel: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  signalValue: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: "600",
  },
  reasonText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  tradeButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  tradeButtonText: {
    ...typography.bodySmall,
    color: colors.textInverse,
    fontWeight: "700",
  },
  tradeCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  tradeHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tradeSymbol: {
    ...typography.h6,
    color: colors.text,
  },
  tradeStatus: {
    ...typography.bodySmall,
    fontWeight: "700",
  },
  tradeMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  bottomSpacer: {
    height: spacing.xl,
  },
})

export default OpportunityScannerScreen