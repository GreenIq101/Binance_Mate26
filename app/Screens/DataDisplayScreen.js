"use client"

import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
  StatusBar,
  RefreshControl,
  Alert,
} from "react-native"
import { useState, useEffect, useRef } from "react"
import { MaterialCommunityIcons } from "@expo/vector-icons"
import { LinearGradient } from "expo-linear-gradient"
import { BlurView } from "../Commponents/BlurViewCompat"
import { collection, getDocs, doc, updateDoc, query, where, orderBy } from "firebase/firestore"
import { db } from "../Firebase/fireConfig"
import { auth } from "../Firebase/fireConfig"
import moment from "moment"

const { width, height } = Dimensions.get("window")

const DataDisplayScreen = ({ navigation }) => {
  const [savedData, setSavedData] = useState([])
  const [unsavedData, setUnsavedData] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedTab, setSelectedTab] = useState("metrics")
  const [orderMetrics, setOrderMetrics] = useState({
    totalOrders: 0,
    accuracy90: 0,
    accuracy80: 0,
    accuracy60: 0,
    accuracy50: 0,
    totalSaved: 0,
    totalUnsaved: 0,
    averageAccuracy: 0,
    profitableTrades: 0,
  })

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(50)).current
  const pulseAnim = useRef(new Animated.Value(1)).current
  const metricsAnim = useRef(new Animated.Value(0)).current

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

    fetchData()
  }, [])

  // Animate metrics when data loads
  useEffect(() => {
    if (orderMetrics.totalOrders > 0) {
      Animated.timing(metricsAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: false,
      }).start()
    }
  }, [orderMetrics])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const user = auth.currentUser
      if (!user) {
        Alert.alert("Error", "Please login to view data")
        return
      }

      const q = query(collection(db, "predictions"), where("userId", "==", user.uid), orderBy("timestamp", "desc"))
      const querySnapshot = await getDocs(q)
      const savedList = []
      const unsavedList = []
      let accuracy90 = 0,
        accuracy80 = 0,
        accuracy60 = 0,
        accuracy50 = 0
      let totalAccuracy = 0
      let accuracyCount = 0
      let profitableTrades = 0

      querySnapshot.docs.forEach((doc) => {
        const dataItem = {
          id: doc.id,
          ...doc.data(),
          resultTime: doc.data().resultTime || "",
          actualPrice: doc.data().actualPrice || "",
          accuracy: doc.data().accuracy || null,
          saved: doc.data().saved || false,
        }

        if (dataItem.accuracy !== null) {
          const acc = Number.parseFloat(dataItem.accuracy)
          totalAccuracy += acc
          accuracyCount++

          if (acc >= 90) accuracy90++
          else if (acc >= 80) accuracy80++
          else if (acc >= 60) accuracy60++
          else if (acc >= 50) accuracy50++

          if (acc > 50) profitableTrades++
        }

        dataItem.saved ? savedList.push(dataItem) : unsavedList.push(dataItem)
      })

      setSavedData(savedList)
      setUnsavedData(unsavedList)
      setOrderMetrics({
        totalOrders: savedList.length + unsavedList.length,
        accuracy90,
        accuracy80,
        accuracy60,
        accuracy50,
        totalSaved: savedList.length,
        totalUnsaved: unsavedList.length,
        averageAccuracy: accuracyCount > 0 ? (totalAccuracy / accuracyCount).toFixed(2) : 0,
        profitableTrades,
      })
    } catch (error) {
      console.error("Error fetching data:", error)
      Alert.alert("Error", "Failed to fetch data")
    } finally {
      setIsLoading(false)
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  const calculateAccuracy = (index, dataList, setDataList) => {
    const updatedData = [...dataList]
    const currentItem = updatedData[index]

    if (currentItem?.resultTime && currentItem?.actualPrice) {
      const actualPrice = Number.parseFloat(currentItem.actualPrice)
      const predictedPrice = Number.parseFloat(currentItem.predictedPrice)

      if (!isNaN(actualPrice) && !isNaN(predictedPrice)) {
        const accuracyPercent = (1 - Math.abs((actualPrice - predictedPrice) / actualPrice)) * 100
        currentItem.accuracy = Math.max(0, accuracyPercent).toFixed(2)
        setDataList(updatedData)
        Alert.alert("Success", `Accuracy calculated: ${currentItem.accuracy}%`)
      } else {
        Alert.alert("Error", "Please enter valid numeric values")
      }
    } else {
      Alert.alert("Error", "Please enter both result time and actual price")
    }
  }

  const saveResults = async (index, dataList, setDataList) => {
    const updatedData = [...dataList]
    const currentItem = updatedData[index]

    if (currentItem.accuracy) {
      try {
        const predictionDocRef = doc(db, "predictions", currentItem.id)
        await updateDoc(predictionDocRef, {
          resultTime: currentItem.resultTime,
          actualPrice: currentItem.actualPrice,
          accuracy: currentItem.accuracy,
          saved: true,
          updatedAt: moment().format(),
        })

        currentItem.saved = true
        setDataList(updatedData)
        Alert.alert("Success", "Results saved successfully!")

        // Refresh data to update metrics
        fetchData()
      } catch (error) {
        console.error("Error saving results:", error)
        Alert.alert("Error", "Failed to save results")
      }
    } else {
      Alert.alert("Error", "Please calculate accuracy before saving")
    }
  }

  const getAccuracyColor = (accuracy) => {
    if (accuracy >= 90) return "#22c55e"
    if (accuracy >= 80) return "#3b82f6"
    if (accuracy >= 60) return "#eab308"
    if (accuracy >= 50) return "#f97316"
    return "#ef4444"
  }

  const getAccuracyIcon = (accuracy) => {
    if (accuracy >= 90) return "trophy"
    if (accuracy >= 80) return "medal"
    if (accuracy >= 60) return "star"
    if (accuracy >= 50) return "thumb-up"
    return "thumb-down"
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

  const MetricCard = ({ title, value, icon, color, percentage }) => (
    <BlurView intensity={15} tint="dark" style={styles.metricCard}>
      <LinearGradient colors={[`${color}20`, `${color}10`]} style={styles.metricGradient}>
        <View style={styles.metricHeader}>
          <MaterialCommunityIcons name={icon} size={24} color={color} />
          <Text style={styles.metricTitle}>{title}</Text>
        </View>
        <Text style={[styles.metricValue, { color }]}>{value}</Text>
        {percentage !== undefined && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: color,
                    width: metricsAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0%", `${percentage}%`],
                    }),
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>{percentage}%</Text>
          </View>
        )}
      </LinearGradient>
    </BlurView>
  )

  const PredictionCard = ({ item, index, dataList, setDataList }) => (
    <BlurView intensity={20} tint="dark" style={styles.predictionCard}>
      <LinearGradient colors={["rgba(0, 0, 0, 0.3)", "rgba(124, 58, 237, 0.1)"]} style={styles.cardGradient}>
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={styles.currencyContainer}>
            <MaterialCommunityIcons name="currency-btc" size={20} color="#f7931a" />
            <Text style={styles.currencyText}>{item.name?.toUpperCase()}</Text>
          </View>
          {item.accuracy && (
            <View style={[styles.accuracyBadge, { backgroundColor: `${getAccuracyColor(item.accuracy)}20` }]}>
              <MaterialCommunityIcons
                name={getAccuracyIcon(item.accuracy)}
                size={16}
                color={getAccuracyColor(item.accuracy)}
              />
              <Text style={[styles.accuracyBadgeText, { color: getAccuracyColor(item.accuracy) }]}>
                {item.accuracy}%
              </Text>
            </View>
          )}
        </View>

        {/* Price Information */}
        <View style={styles.priceSection}>
          <View style={styles.priceItem}>
            <Text style={styles.priceLabel}>Live Price</Text>
            <Text style={styles.priceValue}>${Number.parseFloat(item.price || 0).toFixed(6)}</Text>
          </View>
          <View style={styles.priceItem}>
            <Text style={styles.priceLabel}>Predicted</Text>
            <Text style={styles.predictedValue}>${Number.parseFloat(item.predictedPrice || 0).toFixed(6)}</Text>
          </View>
        </View>

        {/* Technical Indicators */}
        <View style={styles.indicatorsSection}>
          <Text style={styles.sectionTitle}>Technical Indicators</Text>
          <View style={styles.indicatorsGrid}>
            <View style={styles.indicatorItem}>
              <Text style={styles.indicatorLabel}>SMA</Text>
              <Text style={styles.indicatorValue}>{item.sma || "N/A"}</Text>
            </View>
            <View style={styles.indicatorItem}>
              <Text style={styles.indicatorLabel}>EMA</Text>
              <Text style={styles.indicatorValue}>{item.ema || "N/A"}</Text>
            </View>
            <View style={styles.indicatorItem}>
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
                {item.rsi || "N/A"}
              </Text>
            </View>
          </View>
        </View>

        {/* Market Information */}
        <View style={styles.marketSection}>
          <View style={styles.marketItem}>
            <MaterialCommunityIcons
              name={item.marketTrend === "Bullish" ? "trending-up" : "trending-down"}
              size={16}
              color={item.marketTrend === "Bullish" ? "#22c55e" : "#ef4444"}
            />
            <Text style={[styles.marketTrend, { color: item.marketTrend === "Bullish" ? "#22c55e" : "#ef4444" }]}>
              {item.marketTrend || "Unknown"}
            </Text>
          </View>
          <Text style={styles.predictionTime}>
            {item.predictionDate} at {item.predictionTime}
          </Text>
        </View>

        {/* Input Fields for Unsaved Items */}
        {!item.saved && (
          <View style={styles.inputSection}>
            <View style={styles.inputContainer}>
              <MaterialCommunityIcons name="clock-outline" size={16} color="#9ca3af" />
              <TextInput
                placeholder="Result Time (HH:MM:SS)"
                placeholderTextColor="#6b7280"
                style={styles.input}
                value={item.resultTime}
                onChangeText={(value) => {
                  const updatedData = [...dataList]
                  updatedData[index].resultTime = value
                  setDataList(updatedData)
                }}
              />
            </View>
            <View style={styles.inputContainer}>
              <MaterialCommunityIcons name="currency-usd" size={16} color="#9ca3af" />
              <TextInput
                placeholder="Actual Price"
                placeholderTextColor="#6b7280"
                style={styles.input}
                value={item.actualPrice}
                onChangeText={(value) => {
                  const updatedData = [...dataList]
                  updatedData[index].actualPrice = value
                  setDataList(updatedData)
                }}
                keyboardType="numeric"
              />
            </View>
          </View>
        )}

        {/* Action Buttons */}
        {!item.saved && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              onPress={() => calculateAccuracy(index, dataList, setDataList)}
              style={styles.calculateButton}
            >
              <LinearGradient colors={["#3b82f6", "#1d4ed8"]} style={styles.buttonGradient}>
                <MaterialCommunityIcons name="calculator" size={16} color="white" />
                <Text style={styles.buttonText}>Calculate</Text>
              </LinearGradient>
            </TouchableOpacity>

            {item.accuracy && (
              <TouchableOpacity onPress={() => saveResults(index, dataList, setDataList)} style={styles.saveButton}>
                <LinearGradient colors={["#22c55e", "#16a34a"]} style={styles.buttonGradient}>
                  <MaterialCommunityIcons name="content-save" size={16} color="white" />
                  <Text style={styles.buttonText}>Save</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Saved Indicator */}
        {item.saved && (
          <View style={styles.savedIndicator}>
            <MaterialCommunityIcons name="check-circle" size={20} color="#22c55e" />
            <Text style={styles.savedText}>Results Saved</Text>
          </View>
        )}
      </LinearGradient>
    </BlurView>
  )

  const TabButton = ({ title, isActive, onPress, icon }) => (
    <TouchableOpacity onPress={onPress} style={styles.tabButton}>
      <LinearGradient
        colors={isActive ? ["#7c3aed", "#3b82f6"] : ["rgba(255, 255, 255, 0.05)", "rgba(255, 255, 255, 0.05)"]}
        style={styles.tabGradient}
      >
        <MaterialCommunityIcons name={icon} size={20} color={isActive ? "white" : "#9ca3af"} />
        <Text style={[styles.tabText, { color: isActive ? "white" : "#9ca3af" }]}>{title}</Text>
      </LinearGradient>
    </TouchableOpacity>
  )

  if (isLoading) {
    return (
      <LinearGradient colors={["#0f172a", "#1e293b", "#0f172a"]} style={styles.loadingContainer}>
        <MaterialCommunityIcons name="loading" size={50} color="#7c3aed" />
        <Text style={styles.loadingText}>Loading predictions...</Text>
      </LinearGradient>
    )
  }

  return (
    <LinearGradient colors={["#0f172a", "#1e293b", "#0f172a"]} style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Floating Icons */}
      <FloatingIcon icon="chart-bar" top="5%" left="5%" delay={0} />
      <FloatingIcon icon="trending-up" top="15%" left="90%" delay={500} />
      <FloatingIcon icon="database" top="25%" left="8%" delay={1000} />
      <FloatingIcon icon="analytics" top="35%" left="85%" delay={1500} />

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
                    <MaterialCommunityIcons name="chart-timeline-variant" size={24} color="white" />
                  </LinearGradient>
                  <View>
                    <Text style={styles.headerTitle}>Trading Analytics</Text>
                    <Text style={styles.headerSubtitle}>Performance Dashboard</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
                  <MaterialCommunityIcons name="refresh" size={20} color="#7c3aed" />
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </BlurView>

          {/* Tab Navigation */}
          <View style={styles.tabContainer}>
            <TabButton
              title="Metrics"
              icon="chart-donut"
              isActive={selectedTab === "metrics"}
              onPress={() => setSelectedTab("metrics")}
            />
            <TabButton
              title="Saved"
              icon="content-save"
              isActive={selectedTab === "saved"}
              onPress={() => setSelectedTab("saved")}
            />
            <TabButton
              title="Pending"
              icon="clock-outline"
              isActive={selectedTab === "pending"}
              onPress={() => setSelectedTab("pending")}
            />
          </View>

          {/* Metrics Tab */}
          {selectedTab === "metrics" && (
            <View style={styles.metricsContainer}>
              <Text style={styles.sectionTitle}>Performance Overview</Text>

              <View style={styles.metricsGrid}>
                <MetricCard
                  title="Total Orders"
                  value={orderMetrics.totalOrders}
                  icon="format-list-numbered"
                  color="#7c3aed"
                />
                <MetricCard
                  title="Avg Accuracy"
                  value={`${orderMetrics.averageAccuracy}%`}
                  icon="target"
                  color="#3b82f6"
                  percentage={orderMetrics.averageAccuracy}
                />
              </View>

              <View style={styles.metricsGrid}>
                <MetricCard
                  title="Profitable"
                  value={orderMetrics.profitableTrades}
                  icon="trending-up"
                  color="#22c55e"
                  percentage={
                    orderMetrics.totalOrders > 0 ? (orderMetrics.profitableTrades / orderMetrics.totalOrders) * 100 : 0
                  }
                />
                <MetricCard
                  title="Saved Results"
                  value={orderMetrics.totalSaved}
                  icon="content-save"
                  color="#f59e0b"
                  percentage={
                    orderMetrics.totalOrders > 0 ? (orderMetrics.totalSaved / orderMetrics.totalOrders) * 100 : 0
                  }
                />
              </View>

              <Text style={styles.sectionTitle}>Accuracy Distribution</Text>
              <View style={styles.accuracyGrid}>
                <MetricCard title="90%+" value={orderMetrics.accuracy90} icon="trophy" color="#22c55e" />
                <MetricCard title="80%+" value={orderMetrics.accuracy80} icon="medal" color="#3b82f6" />
                <MetricCard title="60%+" value={orderMetrics.accuracy60} icon="star" color="#eab308" />
                <MetricCard title="50%+" value={orderMetrics.accuracy50} icon="thumb-up" color="#f97316" />
              </View>
            </View>
          )}

          {/* Saved Predictions Tab */}
          {selectedTab === "saved" && (
            <View style={styles.predictionsContainer}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Saved Predictions</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{savedData.length}</Text>
                </View>
              </View>

              {savedData.length > 0 ? (
                <FlatList
                  data={savedData}
                  renderItem={({ item, index }) =>
                    PredictionCard({ item, index, dataList: savedData, setDataList: setSavedData })
                  }
                  keyExtractor={(item) => item.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cardList}
                />
              ) : (
                <BlurView intensity={15} tint="dark" style={styles.emptyContainer}>
                  <MaterialCommunityIcons name="database-off" size={50} color="#6b7280" />
                  <Text style={styles.emptyText}>No saved predictions yet</Text>
                  <Text style={styles.emptySubtext}>Complete some predictions to see them here</Text>
                </BlurView>
              )}
            </View>
          )}

          {/* Pending Predictions Tab */}
          {selectedTab === "pending" && (
            <View style={styles.predictionsContainer}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Pending Predictions</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{unsavedData.length}</Text>
                </View>
              </View>

              {unsavedData.length > 0 ? (
                <FlatList
                  data={unsavedData}
                  renderItem={({ item, index }) =>
                    PredictionCard({ item, index, dataList: unsavedData, setDataList: setUnsavedData })
                  }
                  keyExtractor={(item) => item.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cardList}
                />
              ) : (
                <BlurView intensity={15} tint="dark" style={styles.emptyContainer}>
                  <MaterialCommunityIcons name="check-all" size={50} color="#22c55e" />
                  <Text style={styles.emptyText}>All predictions completed!</Text>
                  <Text style={styles.emptySubtext}>Great job on staying up to date</Text>
                </BlurView>
              )}
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </LinearGradient>
  )
}

const styles = {
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: "#9ca3af",
  },
  scrollView: {
    flex: 1,
  },
  mainContainer: {
    padding: 16,
    paddingTop: 50,
    gap: 16,
  },
  floatingIcon: {
    position: "absolute",
    zIndex: 1,
  },
  headerContainer: {
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.2)",
  },
  headerGradient: {
    padding: 16,
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
    color: "white",
    fontWeight: "bold",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#9ca3af",
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(124, 58, 237, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  tabContainer: {
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
    gap: 8,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
  },
  metricsContainer: {
    gap: 16,
  },
  sectionTitle: {
    fontSize: 18,
    color: "white",
    fontWeight: "bold",
    marginBottom: 8,
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  accuracyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metricCard: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  metricGradient: {
    padding: 16,
  },
  metricHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  metricTitle: {
    fontSize: 14,
    color: "#9ca3af",
    fontWeight: "500",
  },
  metricValue: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
  progressContainer: {
    gap: 4,
  },
  progressBar: {
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "right",
  },
  predictionsContainer: {
    gap: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  cardList: {
    paddingHorizontal: 4,
    gap: 16,
  },
  predictionCard: {
    width: width * 0.85,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.2)",
    marginHorizontal: 4,
  },
  cardGradient: {
    padding: 20,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  currencyContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  currencyText: {
    fontSize: 18,
    color: "white",
    fontWeight: "bold",
  },
  accuracyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  accuracyBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  priceSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  priceItem: {
    flex: 1,
  },
  priceLabel: {
    fontSize: 14,
    color: "#9ca3af",
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 18,
    color: "#22c55e",
    fontWeight: "bold",
  },
  predictedValue: {
    fontSize: 18,
    color: "#3b82f6",
    fontWeight: "bold",
  },
  indicatorsSection: {
    marginBottom: 16,
  },
  indicatorsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  indicatorItem: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    padding: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  indicatorLabel: {
    fontSize: 12,
    color: "#9ca3af",
    marginBottom: 2,
  },
  indicatorValue: {
    fontSize: 14,
    color: "white",
    fontWeight: "600",
  },
  marketSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  marketItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  marketTrend: {
    fontSize: 14,
    fontWeight: "600",
  },
  predictionTime: {
    fontSize: 12,
    color: "#9ca3af",
  },
  inputSection: {
    gap: 12,
    marginBottom: 16,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "white",
    paddingVertical: 12,
    paddingLeft: 8,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
  },
  calculateButton: {
    flex: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  saveButton: {
    flex: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  buttonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 6,
  },
  buttonText: {
    fontSize: 14,
    color: "white",
    fontWeight: "600",
  },
  savedIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.2)",
  },
  savedText: {
    fontSize: 14,
    color: "#22c55e",
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
  emptyText: {
    fontSize: 18,
    color: "#9ca3af",
    fontWeight: "600",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 4,
    textAlign: "center",
  },
}

export default DataDisplayScreen
