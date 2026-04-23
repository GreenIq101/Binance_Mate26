"use client"

import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
  StatusBar,
  RefreshControl,
  Alert,
} from "react-native"
import { useState, useEffect, useRef } from "react"
import { MaterialCommunityIcons } from "@expo/vector-icons"
import { LinearGradient } from "expo-linear-gradient"
import { BlurView } from "../Commponents/BlurViewCompat"
import axios from "axios"
import moment from "moment"
import { collection, addDoc, getDocs, query, orderBy, limit } from "firebase/firestore"
import { db } from "../Firebase/fireConfig"
import { colors, spacing, borderRadius, shadows, typography } from "../Styling/ModernLight"

const { width, height } = Dimensions.get("window")

// Helper functions for indicators
const calculateSMA = (data, period) => {
  const sum = data.slice(-period).reduce((acc, price) => acc + price.close, 0)
  return sum / period
}

const calculateEMA = (data, period) => {
  const k = 2 / (period + 1)
  let ema = data[0].close
  for (let i = 1; i < data.length; i++) {
    ema = data[i].close * k + ema * (1 - k)
  }
  return ema
}

const calculateRSI = (data, period) => {
  let gain = 0
  let loss = 0
  for (let i = 1; i < period; i++) {
    const difference = data[i].close - data[i - 1].close
    if (difference >= 0) gain += difference
    else loss -= difference
  }
  gain /= period
  loss /= period
  const rs = gain / (loss === 0 ? 1 : loss)
  return 100 - 100 / (1 + rs)
}

const calculateMACD = (data, shortPeriod, longPeriod, signalPeriod) => {
  const shortEMA = calculateEMA(data, shortPeriod)
  const longEMA = calculateEMA(data, longPeriod)
  const macdLine = shortEMA - longEMA
  return macdLine
}

const calculateBollingerBands = (data, period) => {
  const sma = calculateSMA(data, period)
  const stdDev = Math.sqrt(data.slice(-period).reduce((acc, price) => acc + Math.pow(price.close - sma, 2), 0) / period)
  return {
    lowerBand: sma - 2 * stdDev,
    upperBand: sma + 2 * stdDev,
  }
}

const calculateATR = (data, period) => {
  const trValues = data.slice(1).map((current, i) => {
    const prev = data[i]
    const highLow = current.high - current.low
    const highClose = Math.abs(current.high - prev.close)
    const lowClose = Math.abs(current.low - prev.close)
    return Math.max(highLow, highClose, lowClose)
  })
  return trValues.slice(-period).reduce((sum, tr) => sum + tr, 0) / period
}

const fetchHistoricalData = async (pair) => {
  const interval = "5m"
  const limit = 30
  const url = `https://api.binance.com/api/v3/klines?symbol=${pair.toUpperCase()}&interval=${interval}&limit=${limit}`
  try {
    const res = await axios.get(url)
    return res.data.map((candle) => ({
      open: Number.parseFloat(candle[1]),
      high: Number.parseFloat(candle[2]),
      low: Number.parseFloat(candle[3]),
      close: Number.parseFloat(candle[4]),
    }))
  } catch (error) {
    console.error(`Error fetching historical data for ${pair}:`, error.message)
    throw error
  }
}

const coinPairs = [
  "ltcusdt",
  "btcusdt",
  "bomeusdt",
  "memeusdt",
  "pepeusdt",
  "solusdt",
  "dogeusdt",
  "dogsusdt",
  "bnbusdt",
  "wusdt",
  "linausdt",
  "troyusdt",
  "laziousdt",
  "ogusdt",
  "SLFUSDT",
  "BTCUSDT",
  "SNXUSDT",
  "CAKEUSDT",
  "WANUSDT",
  "ZENUSDT",
  "NEARUSDT",
  "FARMUSDT",
  "IDUSDT",
  "RENUSDT",
  "RENDERUSDT",
  "TRXUSDT",
  "OGNUSDT",
  "DYMUSDT",
  "CTXCUSDT",
  "MOVRUSDT",
  "KSMUSDT",
  "VTHOUSDT",
  "ZRXUSDT",
  "PYRUSDT",
  "ZROUSDT",
  "NEIROUSDT",
  "WRXUSDT",
  "VIDTUSDT",
  "UFTUSDT",
  "ALPHAUSDT",
  "MANTAUSDT",
  "LUMIAUSDT",
  "SUSHIUSDT",
  "NTRNUSDT",
  "KNCUSDT",
  "OAXUSDT",
  "NKNUSDT",
  "ASTUSDT",
  "BEAMXUSDT",
  "GMTUSDT",
  "SYNUSDT",
  "COMPUSDT",
  "ELFUSDT",
  "FISUSDT",
  "ASRUSDT",
  "NEXOUSDT",
  "BNTUSDT",
  "ARUSDT",
  "DARUSDT",
  "PIXELUSDT",
  "TUSDT",
  "AKROUSDT",
  "BIFIUSDT",
  "ARDRUSDT",
  "SANDUSDT",
  "FORTHUSDT",
  "AEURUSDT",
  "GNSUSDT",
  "CFXUSDT",
  "1INCHUSDT",
  "FIROUSDT",
  "GRTUSDT",
  "RAYUSDT",
  "CRVUSDT",
  "ETHUSDT",
  "1000SATSUSDT",
  "QUICKUSDT",
  "BARUSDT",
  "PROMUSDT",
  "KAVAUSDT",
  "IMXUSDT",
  "BOMEUSDT",
  "AEVOUSDT",
  "ZILUSDT",
  "RONINUSDT",
  "TIAUSDT",
  "SYSUSDT",
  "AMBUSDT",
  "AIUSDT",
  "BANDUSDT",
  "GASUSDT",
  "FETUSDT",
  "COMBOUSDT",
  "SOLUSDT",
  "JUVUSDT",
  "VOXELUSDT",
  "REQUSDT",
  "HOOKUSDT",
  "CVCUSDT",
  "UMAUSDT",
  "USDCUSDT",
  "FIOUSDT",
  "RLCUSDT",
  "POLUSDT",
  "PEPEUSDT",
  "SCRTUSDT",
  "IDEXUSDT",
  "FLOKIUSDT",
  "LITUSDT",
  "VIBUSDT",
  "LSXUSDT",
  "GALAUSDT",
  "DATAUSDT",
  "TONUSDT",
  "AAVEUSDT",
  "TAOUSDT",
  "ONTUSDT",
  "WBTCUSDT",
  "XECUSDT",
  "CHRUSDT",
  "SCUSDT",
  "HIFIUSDT",
  "DOTUSDT",
  "CELRUSDT",
  "AUDIOUSDT",
  "RSRUSDT",
  "GHSTUSDT",
  "BNXUSDT",
  "FLOWUSDT",
  "BALUSDT",
  "LQTYUSDT",
  "AUCTIONUSDT",
  "NMRUSDT",
  "MEMEUSDT",
  "HMSTRUSDT",
  "ETCUSDT",
  "AXLUSDT",
  "RADUSDT",
  "BLZUSDT",
  "DODOUSDT",
  "KP3RUSDT",
  "LOKAUSDT",
  "YGGUSDT",
  "GMXUSDT",
  "XVGUSDT",
  "ARBUSDT",
  "HARDUSDT",
  "XIAUSDT",
  "FILUSDT",
  "NFPUSDT",
  "TKOUSDT",
  "RAREUSDT",
  "PERPUSDT",
  "MBLUSDT",
  "JOEUSDT",
  "KMDUSDT",
  "CHZUSDT",
  "UNFIUSDT",
  "WIFUSDT",
  "DOGSUSDT",
  "LTOUSDT",
  "EURIUSDT",
  "GUSDT",
  "SANTOSUSDT",
  "FIDAUSDT",
  "INJUSDT",
  "WINGUSDT",
  "DGBUSDT",
  "BICOUSDT",
  "SEIUSDT",
  "OXTUSDT",
  "CKBUSDT",
  "BCHUSDT",
  "ARPAUSDT",
  "DOTUSDT",
  "EOSUSDT",
  "ROSEUSDT",
  "IOTXUSDT",
  "TROYUSDT",
  "STRAXUSDT",
  "JASMYUSDT",
  "STXUSDT",
  "REIUSDT",
  "OMUSDT",
  "ALICEUSDT",
  "KDAUSDT",
  "ONGUSDT",
  "FUNUSDT",
  "TRBUSDT",
  "JUPUSDT",
  "METISUSDT",
  "VITEUSDT",
  "TNSRUSDT",
  "PONDUSDT",
  "FLMUSDT",
  "SXPUSDT",
  "PHBUSDT",
  "LDUUSDT",
  "PENDLEUSDT",
  "DIAUSDT",
  "XVSUSDT",
  "LAZIOUSDT",
  "AERGOUSDT",
  "TWTUSDT",
  "RDNTUSDT",
  "GLMUSDT",
  "CYBERUSDT",
  "1MBABYDOGEUSDT",
  "SFPUSDT",
  "ILVUSDT",
  "ATMUSDT",
  "CTKUSDT",
  "IQUSDT",
  "THETAUSDT",
  "AVAUSDT",
  "CITTYUSDT",
  "BONKUSDT",
  "DEXEUSDT",
  "FDUSTUSDT",
  "BNBUSDT",
  "ALGOUSDT",
  "PAXGUSDT",
  "LUNCUSDT",
  "STGUSDT",
  "ENAUSDT",
  "BADGERUSDT",
  "ASTRUSDT",
  "MASKUSDT",
  "BATUSDT",
  "STORJUSDT",
  "NEOUSDT",
  "WLDUSDT",
  "XLMUSDT",
  "DYDXUSDT",
  "LRCUSDT",
  "RVNUSDT",
  "TUSDUSDT",
  "TURBOUSDT",
  "DASHUSDT",
  "BBUSDT",
  "ADAUSDT",
  "PEOPLEUSDT",
  "USDPUSDT",
  "DEGOUSDT",
  "VICUSDT",
  "SUNUSDT",
  "FLUXUSDT",
  "TLMUSDT",
  "MTLUSDT",
  "OPUSDT",
  "ARKMUSDT",
  "DAIUSDT",
  "WOOUSDT",
  "CHESSUSDT",
  "ACHUSDT",
  "XRPUSDT",
  "LUNAUSDT",
  "DENTUSDT",
  "KEYUSDT",
  "HBARUSDT",
  "ONEUSDT",
  "QKCUSDT",
  "ENJUSDT",
  "ALTUSDT",
  "WBETHUSDT",
  "ERNUSDT",
  "SUIUSDT",
  "DOGEUSDT",
  "STEEMUSDT",
  "RPLUSDT",
  "PDAUSDT",
  "OMNIUSDT",
  "LSKUSDT",
  "MINAUSDT",
  "MKRUSDT",
  "VETUSDT",
  "PYTHUSDT",
  "LEVERUSDT",
  "MDTUSDT",
  "MBOXUSDT",
  "ZECUSDT",
  "FXSUSDT",
  "DFUSDT",
  "BNSOLUSDT",
  "OSMOUSDT",
  "OOKIUSDT",
  "GLMRUSDT",
  "XNOUSDT",
  "UTKUSDT",
  "BELUSDT",
  "DCRUSDT",
  "CELOUSDT",
  "FTMUSDT",
  "IOTAUSDT",
  "AVAXUSDT",
  "EDUUSDT",
  "AXSUSDT",
  "SAGAUSDT",
  "ZKUSDT",
  "SKLUSDT",
  "COTIUSDT",
  "EIGENUSDT",
  "XTZUSDT",
  "WINUSDT",
  "HIVEUSDT",
  "POLYXUSDT",
  "QIUSDT",
  "ICPUSDT",
  "IOSTUSDT",
  "VANRYUSDT",
  "MAGICUSDT",
  "RIFUSDT",
  "LINAUSDT",
  "UNIUSDT",
  "BAKEUSDT",
  "RUNEUSDT",
  "QUTUSDT",
  "CREAMUSDT",
  "MLNUSDT",
  "HFTUSDT",
  "PSGUSDT",
  "STRKUSDT",
  "AGLDUSDT",
  "API3USDT",
  "STPTUSDT",
  "CTSIUSDT",
  "DUSKUSDT",
  "PUNDIXUSDT",
  "PHAUSDT",
  "ICXUSDT",
  "ANKRUSDT",
  "ENSUSDT",
  "BSWUSDT",
  "SUPER",
  "LISTAUSDT",
  "ATOMUSDT",
  "GFTUSDT",
  "QTUMUSDT",
  "LPTUSDT",
  "EGLDUSDT",
  "JSTUSDT",
  "CVXUSDT",
  "IRISUSDT",
  "REZUSDT",
  "ETHFIUSDT",
  "BLURUSDT",
  "SNTUSDT",
  "C98USDT",
  "PORTOUSDT",
  "SCRUSDT",
  "SSVUSDT",
  "TRUUSDT",
  "JTOUSDT",
  "ATAUSDT",
  "KLAYUSDT",
  "IOUSDT",
  "ACMUSDT",
  "TFUELUSDT",
  "PIVXUSDT",
  "HIGHUSDT",
  "PORTALUSDT",
  "MAVUSDT",
  "GTCUSDT",
  "LTCUSDT",
  "LINKUSDT",
  "BETAUSDT",
  "CLVUSDT",
  "WAXPUSDT",
  "ALPACAUSDT",
  "USTCUSDT",
  "ACEUSDT",
  "ORDIUSDT",
  "SHIBUSDT",
  "CATIUSDT",
  "BANANAUSDT",
  "BTTCUSDT",
  "STMXUSDT",
  "APEUSDT",
  "IDRTUSDT",
  "COSUSDT",
  "ARKUSDT",
  "BURGERUSDT",
  "ALPINEUSDT",
  "MANAUSDT",
  "ACAUSDT",
  "OGUSDT",
  "AMPUSDT",
  "YFIUSDT",
  "NULSUSDT",
  "CITYUSDT",
  "NOTUSDT",
  "APTUSDT",
  "SLPUSDT",
  "GNOUSDT",
  "HOTUSDT",
  "PROSUSDT",
  "ALCXUSDT",
  "FTTUSDT",
  "SUPERUSDT",
]

const ScannerScreen = ({ navigation }) => {
  const [topGainers, setTopGainers] = useState([])
  const [topLosers, setTopLosers] = useState([])
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [scannedPairs, setScannedPairs] = useState(0)
  const [currentPair, setCurrentPair] = useState("")
  const [scanResults, setScanResults] = useState([])
  const [hasSavedData, setHasSavedData] = useState(false)
  const [lastScanTime, setLastScanTime] = useState("")
  const [refreshing, setRefreshing] = useState(false)

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(50)).current
  const pulseAnim = useRef(new Animated.Value(1)).current
  const progressAnim = useRef(new Animated.Value(0)).current

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

    // Load saved data on component mount
    loadSavedData()
  }, [])

  // Animate progress bar
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: scanProgress / 100,
      duration: 300,
      useNativeDriver: false,
    }).start()
  }, [scanProgress])

  const loadSavedData = async () => {
    try {
      const q = query(collection(db, "scanResults"), orderBy("timestamp", "desc"), limit(1))
      const querySnapshot = await getDocs(q)

      if (!querySnapshot.empty) {
        const latestScan = querySnapshot.docs[0].data()
        setScanResults(latestScan.results || [])
        setTopGainers(latestScan.topGainers || [])
        setTopLosers(latestScan.topLosers || [])
        setLastScanTime(latestScan.timestamp)
        setHasSavedData(true)
      }
    } catch (error) {
      console.error("Error loading saved data:", error)
    }
  }

  const saveScanResults = async (results, gainers, losers) => {
    try {
      const scanData = {
        results: results,
        topGainers: gainers,
        topLosers: losers,
        timestamp: moment().format(),
        totalPairs: coinPairs.length,
        scanDuration: "5m",
      }

      await addDoc(collection(db, "scanResults"), scanData)
      setHasSavedData(true)
      setLastScanTime(scanData.timestamp)
      Alert.alert("Success", "Scan results saved successfully!")
    } catch (error) {
      console.error("Error saving scan results:", error)
      Alert.alert("Error", "Failed to save scan results")
    }
  }

  const startScan = async () => {
    setIsScanning(true)
    setScanProgress(0)
    setScannedPairs(0)
    setCurrentPair("")
    setScanResults([])

    const results = []
    const totalPairs = coinPairs.length

    for (let i = 0; i < totalPairs; i++) {
      const pair = coinPairs[i]
      setCurrentPair(pair.toUpperCase())

      try {
        const data = await fetchHistoricalData(pair)
        const sma = calculateSMA(data, 14)
        const ema = calculateEMA(data, 14)
        const rsi = calculateRSI(data, 14)
        const macd = calculateMACD(data, 12, 26, 9)
        const bands = calculateBollingerBands(data, 20)
        const atr = calculateATR(data, 14)

        const currentPrice = data[data.length - 1].close
        const previousPrice = data[data.length - 2].close
        const priceChange = ((currentPrice - previousPrice) / previousPrice) * 100

        // Enhanced prediction logic
        const rsiSignal = rsi > 70 ? -1 : rsi < 30 ? 1 : 0
        const macdSignal = macd > 0 ? 1 : -1
        const pricePosition = currentPrice > sma ? 1 : -1

        const combinedSignal = (rsiSignal + macdSignal + pricePosition) / 3
        const predictedChange = priceChange * (1 + combinedSignal * 0.1)

        results.push({
          pair: pair.toUpperCase(),
          currentPrice: currentPrice.toFixed(8),
          priceChange: priceChange.toFixed(2),
          predictedChange: predictedChange.toFixed(2),
          sma: sma.toFixed(6),
          ema: ema.toFixed(6),
          rsi: rsi.toFixed(2),
          macd: macd.toFixed(6),
          lowerBand: bands.lowerBand.toFixed(6),
          upperBand: bands.upperBand.toFixed(6),
          atr: atr.toFixed(6),
          signal: combinedSignal > 0.2 ? "BUY" : combinedSignal < -0.2 ? "SELL" : "HOLD",
          strength: Math.abs(combinedSignal).toFixed(2),
        })
      } catch (error) {
        console.error(`Error analyzing ${pair}:`, error.message)
      }

      const progress = ((i + 1) / totalPairs) * 100
      setScanProgress(progress)
      setScannedPairs(i + 1)

      // Small delay to prevent rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    // Sort results
    const sortedByChange = [...results].sort(
      (a, b) => Number.parseFloat(b.priceChange) - Number.parseFloat(a.priceChange),
    )
    const gainers = sortedByChange.slice(0, 10)
    const losers = sortedByChange.slice(-10).reverse()

    setScanResults(results)
    setTopGainers(gainers)
    setTopLosers(losers)
    setIsScanning(false)
    setCurrentPair("")
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await loadSavedData()
    setRefreshing(false)
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

  const PairCard = ({ item, index, type }) => (
    <BlurView intensity={15} tint="dark" style={styles.pairCard}>
      <LinearGradient
        colors={
          type === "gainer"
            ? ["rgba(34, 197, 94, 0.1)", "rgba(34, 197, 94, 0.05)"]
            : ["rgba(239, 68, 68, 0.1)", "rgba(239, 68, 68, 0.05)"]
        }
        style={styles.pairGradient}
      >
        <View style={styles.pairHeader}>
          <View style={styles.pairInfo}>
            <MaterialCommunityIcons name="currency-btc" size={20} color="#f7931a" />
            <Text style={styles.pairName}>{item.pair}</Text>
            <View style={[styles.signalBadge, { backgroundColor: getSignalColor(item.signal) + "20" }]}>
              <Text style={[styles.signalText, { color: getSignalColor(item.signal) }]}>{item.signal}</Text>
            </View>
          </View>
          <Text style={styles.rankText}>#{index + 1}</Text>
        </View>

        <View style={styles.pairStats}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Price</Text>
            <Text style={styles.statValue}>${item.currentPrice}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Change</Text>
            <Text
              style={[styles.changeValue, { color: Number.parseFloat(item.priceChange) >= 0 ? "#22c55e" : "#ef4444" }]}
            >
              {Number.parseFloat(item.priceChange) >= 0 ? "+" : ""}
              {item.priceChange}%
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Predicted</Text>
            <Text
              style={[
                styles.predictedValue,
                { color: Number.parseFloat(item.predictedChange) >= 0 ? "#3b82f6" : "#f97316" },
              ]}
            >
              {Number.parseFloat(item.predictedChange) >= 0 ? "+" : ""}
              {item.predictedChange}%
            </Text>
          </View>
        </View>

        <View style={styles.technicalIndicators}>
          <View style={styles.indicatorRow}>
            <View style={styles.indicator}>
              <Text style={styles.indicatorLabel}>RSI</Text>
              <Text
                style={[
                  styles.indicatorValue,
                  {
                    color:
                      Number.parseFloat(item.rsi) > 70
                        ? "#ef4444"
                        : Number.parseFloat(item.rsi) < 30
                          ? "#22c55e"
                          : "#9ca3af",
                  },
                ]}
              >
                {item.rsi}
              </Text>
            </View>
            <View style={styles.indicator}>
              <Text style={styles.indicatorLabel}>SMA</Text>
              <Text style={styles.indicatorValue}>{Number.parseFloat(item.sma).toFixed(4)}</Text>
            </View>
            <View style={styles.indicator}>
              <Text style={styles.indicatorLabel}>EMA</Text>
              <Text style={styles.indicatorValue}>{Number.parseFloat(item.ema).toFixed(4)}</Text>
            </View>
          </View>
        </View>
      </LinearGradient>
    </BlurView>
  )

  const getSignalColor = (signal) => {
    switch (signal) {
      case "BUY":
        return "#22c55e"
      case "SELL":
        return "#ef4444"
      default:
        return "#eab308"
    }
  }

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
          <BlurView intensity={20} tint="dark" style={styles.headerContainer}>
            <LinearGradient
              colors={["rgba(124, 58, 237, 0.1)", "rgba(59, 130, 246, 0.1)"]}
              style={styles.headerGradient}
            >
              <View style={styles.headerContent}>
                <View style={styles.headerLeft}>
                  <LinearGradient colors={["#7c3aed", "#3b82f6"]} style={styles.headerIcon}>
                    <MaterialCommunityIcons name="radar" size={24} color="white" />
                  </LinearGradient>
                  <View>
                    <Text style={styles.headerTitle}>Market Scanner</Text>
                    <Text style={styles.headerSubtitle}>5-Minute Predictions</Text>
                  </View>
                </View>
                {hasSavedData && (
                  <View style={styles.lastScanInfo}>
                    <Text style={styles.lastScanLabel}>Last Scan</Text>
                    <Text style={styles.lastScanTime}>{moment(lastScanTime).format("HH:mm")}</Text>
                  </View>
                )}
              </View>
            </LinearGradient>
          </BlurView>

          {/* Scanner Control */}
          <BlurView intensity={15} tint="dark" style={styles.scannerContainer}>
            <LinearGradient colors={["rgba(0, 0, 0, 0.3)", "rgba(124, 58, 237, 0.1)"]} style={styles.scannerGradient}>
              {!isScanning ? (
                <View style={styles.scannerIdle}>
                  <MaterialCommunityIcons name="radar" size={50} color="#7c3aed" />
                  <Text style={styles.scannerTitle}>Ready to Scan</Text>
                  <Text style={styles.scannerSubtitle}>Analyze {coinPairs.length} crypto pairs for opportunities</Text>

                  <TouchableOpacity onPress={startScan} style={styles.startScanButton}>
                    <LinearGradient colors={["#7c3aed", "#3b82f6"]} style={styles.startScanGradient}>
                      <MaterialCommunityIcons name="play" size={20} color="white" />
                      <Text style={styles.startScanText}>Start Market Scan</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.scannerActive}>
                  <MaterialCommunityIcons name="loading" size={40} color="#7c3aed" />
                  <Text style={styles.scanningTitle}>Scanning Market...</Text>
                  <Text style={styles.currentPairText}>Analyzing: {currentPair}</Text>

                  <View style={styles.progressContainer}>
                    <View style={styles.progressInfo}>
                      <Text style={styles.progressText}>
                        {scannedPairs} / {coinPairs.length} pairs
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
          </BlurView>

          {/* Save Results Button */}
          {!isScanning && (topGainers.length > 0 || topLosers.length > 0) && (
            <TouchableOpacity
              onPress={() => saveScanResults(scanResults, topGainers, topLosers)}
              style={styles.saveButton}
            >
              <LinearGradient colors={["#22c55e", "#16a34a"]} style={styles.saveGradient}>
                <MaterialCommunityIcons name="content-save" size={20} color="white" />
                <Text style={styles.saveText}>Save Scan Results</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {/* Results Section */}
          {(topGainers.length > 0 || topLosers.length > 0) && (
            <View style={styles.resultsWrapper}>
              {/* Top Gainers */}
              <View style={styles.resultsSection}>
                <View style={styles.sectionHeader}>
                  <MaterialCommunityIcons name="trending-up" size={24} color="#22c55e" />
                  <Text style={styles.sectionTitle}>Top Gainers</Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{topGainers.length}</Text>
                  </View>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsList}>
                  {topGainers.map((item, index) => (
                    <PairCard key={`gainer-${index}`} item={item} index={index} type="gainer" />
                  ))}
                </ScrollView>
              </View>

              {/* Top Losers */}
              <View style={styles.resultsSection}>
                <View style={styles.sectionHeader}>
                  <MaterialCommunityIcons name="trending-down" size={24} color="#ef4444" />
                  <Text style={styles.sectionTitle}>Top Losers</Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{topLosers.length}</Text>
                  </View>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsList}>
                  {topLosers.map((item, index) => (
                    <PairCard key={`loser-${index}`} item={item} index={index} type="loser" />
                  ))}
                </ScrollView>
              </View>
            </View>
          )}

          {/* Empty State */}
          {!isScanning && topGainers.length === 0 && topLosers.length === 0 && (
            <BlurView intensity={15} tint="dark" style={styles.emptyContainer}>
              <MaterialCommunityIcons name="radar" size={60} color="#6b7280" />
              <Text style={styles.emptyTitle}>No Scan Data Available</Text>
              <Text style={styles.emptySubtitle}>Start a market scan to discover trading opportunities</Text>
            </BlurView>
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
    gap: spacing.md,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.surfaceVariant,
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
  lastScanInfo: {
    alignItems: "flex-end",
  },
  lastScanLabel: {
    fontSize: 12,
    color: "#9ca3af",
  },
  lastScanTime: {
    fontSize: 14,
    color: "#22c55e",
    fontWeight: "600",
  },
  scannerContainer: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.2)",
  },
  scannerGradient: {
    padding: 20,
  },
  scannerIdle: {
    alignItems: "center",
    gap: 12,
  },
  scannerTitle: {
    fontSize: 20,
    color: "white",
    fontWeight: "bold",
  },
  scannerSubtitle: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
  },
  startScanButton: {
    marginTop: 16,
    borderRadius: 12,
    overflow: "hidden",
  },
  startScanGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 32,
    gap: 8,
  },
  startScanText: {
    fontSize: 16,
    color: "white",
    fontWeight: "600",
  },
  scannerActive: {
    alignItems: "center",
    gap: 12,
  },
  scanningTitle: {
    fontSize: 18,
    color: "white",
    fontWeight: "bold",
  },
  currentPairText: {
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
    fontSize: 14,
    color: "#9ca3af",
  },
  progressPercent: {
    fontSize: 14,
    color: "#7c3aed",
    fontWeight: "600",
  },
  progressBar: {
    height: 8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#7c3aed",
    borderRadius: 4,
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
    color: "white",
    fontWeight: "600",
  },
  resultsWrapper: {
    gap: 20,
  },
  resultsSection: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    color: "white",
    fontWeight: "bold",
    flex: 1,
  },
  countBadge: {
    backgroundColor: "rgba(124, 58, 237, 0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.3)",
  },
  countText: {
    fontSize: 14,
    color: "#c4b5fd",
    fontWeight: "600",
  },
  cardsList: {
    paddingHorizontal: 4,
    gap: 12,
  },
  pairCard: {
    width: width * 0.8,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  pairGradient: {
    padding: 16,
  },
  pairHeader: {
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
    color: "white",
    fontWeight: "bold",
  },
  signalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  signalText: {
    fontSize: 12,
    fontWeight: "600",
  },
  rankText: {
    fontSize: 14,
    color: "#9ca3af",
    fontWeight: "600",
  },
  pairStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 12,
    color: "#9ca3af",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    color: "white",
    fontWeight: "600",
  },
  changeValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  predictedValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  technicalIndicators: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 8,
    padding: 8,
  },
  indicatorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  indicator: {
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
    color: "white",
    fontWeight: "600",
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

export default ScannerScreen
