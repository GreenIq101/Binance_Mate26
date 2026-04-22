"use client"

import { useEffect, useMemo, useState } from "react"
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, StatusBar } from "react-native"
import { MaterialCommunityIcons } from "@expo/vector-icons"
import { colors, spacing, borderRadius, shadows, typography } from "../Styling/ModernLight"
import apiClient from "../l/apiClient"

const STABLE_COINS = new Set(["USDT", "USDC", "BUSD", "FDUSD", "TUSD", "DAI", "USDP"])

const normalizeAsset = (asset) => {
  if (!asset) return ""
  return asset.replace(/^LD/, "").toUpperCase()
}

const formatQty = (value, decimals = 6) => {
  const n = Number.parseFloat(value || 0)
  if (!Number.isFinite(n) || n === 0) return "0"
  if (Math.abs(n) < 0.0001) return n.toExponential(2)
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals })
}

const formatUsd = (value) => {
  const n = Number.parseFloat(value || 0)
  if (!Number.isFinite(n)) return "$0.00"
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const AccountScreen = () => {
  const [account, setAccount] = useState(null)
  const [balances, setBalances] = useState([])
  const [openOrders, setOpenOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedTab, setSelectedTab] = useState("balances")
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    loadAccountData()
  }, [])

  const estimateUsdtValue = (asset, totalQty, priceMap) => {
    const normalized = normalizeAsset(asset)
    if (!normalized || totalQty <= 0) return 0
    if (STABLE_COINS.has(normalized)) return totalQty

    const directPair = `${normalized}USDT`
    const directPrice = priceMap.get(directPair)
    if (directPrice) return totalQty * directPrice

    return 0
  }

  const loadAccountData = async () => {
    try {
      setLoading(true)
      setErrorMessage("")

      const [accountData, orders, tickers] = await Promise.all([
        apiClient.getAccount(),
        apiClient.getOpenOrders().catch(() => []),
        apiClient.getAllTickers().catch(() => []),
      ])

      const priceMap = new Map()
      for (const t of tickers || []) {
        if (t?.symbol && t?.price) {
          priceMap.set(t.symbol, Number.parseFloat(t.price))
        }
      }

      const rawBalances = (accountData?.balances || []).filter((b) => {
        const total = Number.parseFloat(b.free || 0) + Number.parseFloat(b.locked || 0)
        return total > 0
      })

      const enrichedBalances = rawBalances
        .map((b) => {
          const free = Number.parseFloat(b.free || 0)
          const locked = Number.parseFloat(b.locked || 0)
          const total = free + locked
          const estUsdt = estimateUsdtValue(b.asset, total, priceMap)
          return {
            ...b,
            freeNum: free,
            lockedNum: locked,
            totalNum: total,
            estUsdt,
          }
        })
        .sort((a, b) => b.estUsdt - a.estUsdt)

      setAccount(accountData)
      setBalances(enrichedBalances)
      setOpenOrders(orders || [])
    } catch (error) {
      console.error("Error loading account:", error)
      if (error?.code === "PROXY_UNREACHABLE") {
        setErrorMessage("Local Binance proxy is not running. Start it with: npm run proxy")
      } else {
        setErrorMessage(error?.message || "Failed to load account data.")
      }
    } finally {
      setLoading(false)
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await loadAccountData()
    setRefreshing(false)
  }

  const totalPortfolioUsdt = useMemo(
    () => balances.reduce((sum, b) => sum + (Number.isFinite(b.estUsdt) ? b.estUsdt : 0), 0),
    [balances],
  )

  const TabButton = ({ tab, label, icon }) => (
    <TouchableOpacity style={[styles.tabButton, selectedTab === tab && styles.tabButtonActive]} onPress={() => setSelectedTab(tab)}>
      <MaterialCommunityIcons name={icon} size={18} color={selectedTab === tab ? colors.primary : colors.textTertiary} />
      <Text style={[styles.tabText, selectedTab === tab && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  )

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <MaterialCommunityIcons name="loading" size={40} color={colors.primary} />
          <Text style={styles.loadingText}>Loading wallet...</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View>
              <Text style={styles.summaryLabel}>Estimated Balance (USDT)</Text>
              <Text style={styles.summaryAmount}>{formatUsd(totalPortfolioUsdt)}</Text>
              <Text style={styles.summarySub}>{balances.length} assets</Text>
            </View>
            <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
              <MaterialCommunityIcons name="refresh" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Maker Fee</Text>
              <Text style={styles.metricValue}>{(account?.makerCommission || 0) / 100}%</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Taker Fee</Text>
              <Text style={styles.metricValue}>{(account?.takerCommission || 0) / 100}%</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Open Orders</Text>
              <Text style={styles.metricValue}>{openOrders.length}</Text>
            </View>
          </View>
        </View>

        {!!errorMessage && (
          <View style={styles.errorBanner}>
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.error} />
            <Text style={styles.errorBannerText}>{errorMessage}</Text>
          </View>
        )}

        <View style={styles.tabContainer}>
          <TabButton tab="balances" label="Balances" icon="wallet-outline" />
          <TabButton tab="orders" label="Orders" icon="format-list-bulleted" />
          <TabButton tab="details" label="Details" icon="information-outline" />
        </View>

        {selectedTab === "balances" && (
          <View style={styles.content}>
            {balances.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="wallet-outline" size={50} color={colors.textTertiary} />
                <Text style={styles.emptyText}>No balances found</Text>
              </View>
            ) : (
              balances.map((item, index) => (
                <View key={`${item.asset}-${index}`} style={styles.balanceCard}>
                  <View style={styles.balanceHeader}>
                    <View>
                      <Text style={styles.assetSymbol}>{item.asset}</Text>
                      <Text style={styles.assetQty}>Total: {formatQty(item.totalNum)}</Text>
                    </View>
                    <View style={styles.assetValueWrap}>
                      <Text style={styles.assetValue}>{formatUsd(item.estUsdt)}</Text>
                      {item.estUsdt >= 10 ? <Text style={styles.largeTag}>Large</Text> : null}
                    </View>
                  </View>
                  <View style={styles.balanceRow}>
                    <Text style={styles.balanceLabel}>Available</Text>
                    <Text style={styles.balanceValue}>{formatQty(item.freeNum)}</Text>
                  </View>
                  <View style={styles.balanceRow}>
                    <Text style={styles.balanceLabel}>Locked</Text>
                    <Text style={styles.balanceValue}>{formatQty(item.lockedNum)}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {selectedTab === "orders" && (
          <View style={styles.content}>
            {openOrders.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="check-circle-outline" size={50} color={colors.textTertiary} />
                <Text style={styles.emptyText}>No open orders</Text>
              </View>
            ) : (
              openOrders.map((order, index) => (
                <View key={`${order.orderId}-${index}`} style={styles.orderCard}>
                  <View style={styles.orderHeader}>
                    <Text style={styles.orderSymbol}>{order.symbol}</Text>
                    <Text style={styles.orderSide}>{order.side}</Text>
                  </View>
                  <View style={styles.orderRow}>
                    <Text style={styles.orderLabel}>Price</Text>
                    <Text style={styles.orderValue}>${Number.parseFloat(order.price || 0).toFixed(6)}</Text>
                  </View>
                  <View style={styles.orderRow}>
                    <Text style={styles.orderLabel}>Quantity</Text>
                    <Text style={styles.orderValue}>{formatQty(order.origQty, 6)}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {selectedTab === "details" && account && (
          <View style={styles.content}>
            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>Account Details</Text>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Account Type</Text>
                <Text style={styles.detailValue}>{account.accountType || "SPOT"}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Can Trade</Text>
                <Text style={styles.detailValue}>{account.canTrade ? "Yes" : "No"}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Can Withdraw</Text>
                <Text style={styles.detailValue}>{account.canWithdraw ? "Yes" : "No"}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Can Deposit</Text>
                <Text style={styles.detailValue}>{account.canDeposit ? "Yes" : "No"}</Text>
              </View>
            </View>
          </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  summaryCard: {
    backgroundColor: colors.card,
    margin: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  summaryAmount: {
    ...typography.h3,
    color: colors.text,
    marginTop: spacing.xs,
  },
  summarySub: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  refreshBtn: {
    padding: spacing.sm,
    backgroundColor: colors.surfaceVariant,
    borderRadius: borderRadius.full,
  },
  metricsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  metricBox: {
    flex: 1,
    backgroundColor: colors.surfaceVariant,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
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
  tabContainer: {
    flexDirection: "row",
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceVariant,
    borderRadius: borderRadius.md,
  },
  tabButtonActive: {
    backgroundColor: colors.primary + "15",
  },
  tabText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: "600",
  },
  content: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  balanceCard: {
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  balanceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  assetSymbol: {
    ...typography.h6,
    color: colors.text,
  },
  assetQty: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  assetValueWrap: {
    alignItems: "flex-end",
  },
  assetValue: {
    ...typography.body,
    color: colors.text,
    fontWeight: "700",
  },
  largeTag: {
    ...typography.caption,
    color: colors.secondary,
    fontWeight: "600",
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  balanceLabel: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  balanceValue: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: "600",
  },
  orderCard: {
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  orderSymbol: {
    ...typography.h6,
    color: colors.text,
  },
  orderSide: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: "700",
  },
  orderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  orderLabel: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  orderValue: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: "600",
  },
  detailCard: {
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailTitle: {
    ...typography.h6,
    color: colors.text,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  detailLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  detailValue: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.textTertiary,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.error + "15",
    borderColor: colors.error + "55",
    borderWidth: 1,
    borderRadius: borderRadius.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  errorBannerText: {
    ...typography.bodySmall,
    color: colors.error,
    flex: 1,
  },
  bottomSpacer: {
    height: spacing.xl,
  },
})

export default AccountScreen
