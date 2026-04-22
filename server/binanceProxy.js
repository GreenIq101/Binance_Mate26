const express = require("express")
const cors = require("cors")
const axios = require("axios")
const CryptoJS = require("crypto-js")
const path = require("path")

const app = express()
const PORT = process.env.PORT || 4000

const binanceBase = "https://api.binance.com"

const API_KEY = process.env.BINANCE_API_KEY || "Wl7uain76cx784x3je3BVLSKaQiERfVbmqYxGN1nhFYeokIxdtxtNaKQkANcYr2O"
const API_SECRET = process.env.BINANCE_API_SECRET || "KAsAgqzFdJemmOsQ58NiXUkUcCtUJGYHYcNnekm8s4k1pQ0mrfX1ercukB6TTNlS"

app.use(cors())
app.use(express.json())

const hasCredentials = () => API_KEY && API_SECRET

const createSignature = (queryString) => {
  return CryptoJS.HmacSHA256(queryString, API_SECRET).toString()
}

const signedGet = async (path, queryString = "") => {
  const url = `${binanceBase}${path}${queryString ? "?" + queryString : ""}&signature=${createSignature(queryString)}`
  const { data } = await axios.get(url, {
    headers: { "X-MBX-APIKEY": API_KEY },
  })
  return data
}

app.get("/", (_, res) => {
  res.json({
    ok: true,
    service: "Binance API Proxy",
    version: "1.0",
    endpoints: {
      health: "/health",
      account: "/api/v3/account",
      balances: "/api/balances",
      openOrders: "/api/openOrders",
      allTickers: "/api/v3/ticker/price",
      ticker: "/api/ticker?symbol=BTCUSDT",
      topMovers: "/api/topMovers",
      klines: "/api/klines?symbol=BTCUSDT&interval=5m",
      exchangeInfo: "/api/v3/exchangeInfo",
    },
  })
})

app.get("/health", (_, res) => {
  res.json({
    ok: true,
    hasCredentials: hasCredentials(),
    timestamp: new Date().toISOString(),
  })
})

// Account Info
app.get("/api/v3/account", async (req, res) => {
  try {
    if (!hasCredentials()) {
      return res.status(500).json({ error: "Missing API credentials" })
    }
    const timestamp = Date.now()
    const data = await signedGet("/api/v3/account", `timestamp=${timestamp}`)
    res.json(data)
  } catch (err) {
    res.status(err?.response?.status || 500).json(err?.response?.data || { message: err.message })
  }
})

// Balances (filtered, non-zero only)
app.get("/api/balances", async (req, res) => {
  try {
    if (!hasCredentials()) {
      return res.status(500).json({ error: "Missing API credentials" })
    }
    const timestamp = Date.now()
    const account = await signedGet("/api/v3/account", `timestamp=${timestamp}`)
    const balances = (account.balances || [])
      .filter((b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .map((b) => ({
        asset: b.asset,
        free: parseFloat(b.free),
        locked: parseFloat(b.locked),
        total: parseFloat(b.free) + parseFloat(b.locked),
      }))
    res.json({ balances })
  } catch (err) {
    res.status(err?.response?.status || 500).json(err?.response?.data || { message: err.message })
  }
})

// Open Orders
app.get("/api/openOrders", async (req, res) => {
  try {
    if (!hasCredentials()) {
      return res.status(500).json({ error: "Missing API credentials" })
    }
    const symbol = (req.query.symbol || "BTCUSDT").toUpperCase()
    const timestamp = Date.now()
    const data = await signedGet("/api/v3/openOrders", `symbol=${encodeURIComponent(symbol)}&timestamp=${timestamp}`)
    res.json(data)
  } catch (err) {
    res.status(err?.response?.status || 500).json(err?.response?.data || { message: err.message })
  }
})

// All Prices (public)
app.get("/api/v3/ticker/price", async (req, res) => {
  try {
    const { data } = await axios.get(`${binanceBase}/api/v3/ticker/price`)
    res.json(data)
  } catch (err) {
    res.status(err?.response?.status || 500).json(err?.response?.data || { message: err.message })
  }
})

// Single Ticker (public)
app.get("/api/ticker", async (req, res) => {
  try {
    const symbol = (req.query.symbol || "BTCUSDT").toUpperCase()
    const { data } = await axios.get(`${binanceBase}/api/v3/ticker/price`, { params: { symbol } })
    res.json(data)
  } catch (err) {
    res.status(err?.response?.status || 500).json(err?.response?.data || { message: err.message })
  }
})

// Top Movers (24h change)
app.get("/api/topMovers", async (req, res) => {
  try {
    const { data } = await axios.get(`${binanceBase}/api/v3/ticker/24hr`)
    const topGainers = data
      .filter((t) => t.symbol.endsWith("USDT"))
      .sort((a, b) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent))
      .slice(0, 10)
      .map((t) => ({
        symbol: t.symbol,
        price: parseFloat(t.lastPrice),
        change: parseFloat(t.priceChangePercent),
        high: parseFloat(t.highPrice),
        low: parseFloat(t.lowPrice),
        volume: parseFloat(t.volume),
      }))
    const topLosers = [...data]
      .filter((t) => t.symbol.endsWith("USDT"))
      .sort((a, b) => parseFloat(a.priceChangePercent) - parseFloat(b.priceChangePercent))
      .slice(0, 10)
      .map((t) => ({
        symbol: t.symbol,
        price: parseFloat(t.lastPrice),
        change: parseFloat(t.priceChangePercent),
        high: parseFloat(t.highPrice),
        low: parseFloat(t.lowPrice),
        volume: parseFloat(t.volume),
      }))
    res.json({ gainers: topGainers, losers: topLosers })
  } catch (err) {
    res.status(err?.response?.status || 500).json(err?.response?.data || { message: err.message })
  }
})

// Kline/Candlestick Data
app.get("/api/klines", async (req, res) => {
  try {
    const symbol = (req.query.symbol || "BTCUSDT").toUpperCase()
    const interval = req.query.interval || "5m"
    const limit = parseInt(req.query.limit) || 30
    const { data } = await axios.get(`${binanceBase}/api/v3/klines`, {
      params: { symbol, interval, limit },
    })
    const formatted = data.map((k) => ({
      openTime: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      closeTime: k[6],
    }))
    res.json(formatted)
  } catch (err) {
    res.status(err?.response?.status || 500).json(err?.response?.data || { message: err.message })
  }
})

// Exchange Info
app.get("/api/v3/exchangeInfo", async (req, res) => {
  try {
    const { data } = await axios.get(`${binanceBase}/api/v3/exchangeInfo`)
    const symbols = data.symbols
      ?.filter((s) => s.status === "TRADING" && s.quoteAsset === "USDT")
      .map((s) => s.symbol) || []
    res.json({ symbols })
  } catch (err) {
    res.status(err?.response?.status || 500).json(err?.response?.data || { message: err.message })
  }
})

// Order Book Depth
app.get("/api/depth", async (req, res) => {
  try {
    const symbol = (req.query.symbol || "BTCUSDT").toUpperCase()
    const limit = parseInt(req.query.limit) || 20
    const { data } = await axios.get(`${binanceBase}/api/v3/depth`, {
      params: { symbol, limit },
    })
    res.json(data)
  } catch (err) {
    res.status(err?.response?.status || 500).json(err?.response?.data || { message: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`Binance proxy running on http://localhost:${PORT}`)
})