const express = require("express")
const cors = require("cors")
const axios = require("axios")
const CryptoJS = require("crypto-js")
const fs = require("fs")
const path = require("path")

const app = express()
const port = process.env.PORT || 4000
const binanceBase = "https://api.binance.com"

const readKeysFromApiTxt = () => {
  try {
    const apiTxtPath = path.resolve(process.cwd(), "API.txt")
    if (!fs.existsSync(apiTxtPath)) return { key: "", secret: "" }
    const content = fs.readFileSync(apiTxtPath, "utf8")
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    const keyIndex = lines.findIndex((line) => /API\s*Key/i.test(line))
    const secretIndex = lines.findIndex((line) => /Secret\s*Key/i.test(line))

    return {
      key: keyIndex >= 0 ? lines[keyIndex + 1] || "" : "",
      secret: secretIndex >= 0 ? lines[secretIndex + 1] || "" : "",
    }
  } catch (_error) {
    return { key: "", secret: "" }
  }
}

const fileKeys = readKeysFromApiTxt()
const API_KEY = process.env.BINANCE_API_KEY || fileKeys.key || ""
const API_SECRET = process.env.BINANCE_API_SECRET || fileKeys.secret || ""

app.use(cors())
app.use(express.json())

const hasCredentials = () => API_KEY && API_SECRET

app.get("/", (_, res) => {
  res.json({
    ok: true,
    message: "Binance proxy is running",
    health: "/health",
    account: "/api/v3/account",
    openOrders: "/api/v3/openOrders?symbol=BTCUSDT",
  })
})

const createSignature = (queryString) => {
  return CryptoJS.HmacSHA256(queryString, API_SECRET).toString()
}

const signedRequest = async (path, queryString) => {
  const signature = createSignature(queryString)
  const url = `${binanceBase}${path}?${queryString}&signature=${signature}`

  const response = await axios.get(url, {
    headers: {
      "X-MBX-APIKEY": API_KEY,
    },
  })

  return response.data
}

app.get("/health", (_, res) => {
  res.json({
    ok: true,
    proxy: "binance",
    hasCredentials: !!hasCredentials(),
  })
})

app.get("/api/v3/account", async (_, res) => {
  try {
    if (!hasCredentials()) {
      return res.status(500).json({ error: "Missing BINANCE_API_KEY or BINANCE_API_SECRET" })
    }

    const timestamp = Date.now()
    const data = await signedRequest("/api/v3/account", `timestamp=${timestamp}`)
    return res.json(data)
  } catch (error) {
    const status = error?.response?.status || 500
    const payload = error?.response?.data || { message: error.message }
    return res.status(status).json(payload)
  }
})

app.get("/api/v3/openOrders", async (req, res) => {
  try {
    if (!hasCredentials()) {
      return res.status(500).json({ error: "Missing BINANCE_API_KEY or BINANCE_API_SECRET" })
    }

    const symbol = (req.query.symbol || "BTCUSDT").toUpperCase()
    const timestamp = Date.now()
    const query = `symbol=${encodeURIComponent(symbol)}&timestamp=${timestamp}`
    const data = await signedRequest("/api/v3/openOrders", query)
    return res.json(data)
  } catch (error) {
    const status = error?.response?.status || 500
    const payload = error?.response?.data || { message: error.message }
    return res.status(status).json(payload)
  }
})

app.get("/api/v3/ticker/price", async (req, res) => {
  try {
    const response = await axios.get(`${binanceBase}/api/v3/ticker/price`, { params: req.query })
    return res.json(response.data)
  } catch (error) {
    const status = error?.response?.status || 500
    const payload = error?.response?.data || { message: error.message }
    return res.status(status).json(payload)
  }
})

app.get("/api/v3/ticker/24hr", async (req, res) => {
  try {
    const response = await axios.get(`${binanceBase}/api/v3/ticker/24hr`, { params: req.query })
    return res.json(response.data)
  } catch (error) {
    const status = error?.response?.status || 500
    const payload = error?.response?.data || { message: error.message }
    return res.status(status).json(payload)
  }
})

app.get("/api/v3/exchangeInfo", async (_, res) => {
  try {
    const response = await axios.get(`${binanceBase}/api/v3/exchangeInfo`)
    return res.json(response.data)
  } catch (error) {
    const status = error?.response?.status || 500
    const payload = error?.response?.data || { message: error.message }
    return res.status(status).json(payload)
  }
})

app.get("/api/v3/klines", async (req, res) => {
  try {
    const response = await axios.get(`${binanceBase}/api/v3/klines`, { params: req.query })
    return res.json(response.data)
  } catch (error) {
    const status = error?.response?.status || 500
    const payload = error?.response?.data || { message: error.message }
    return res.status(status).json(payload)
  }
})

app.get("/api/v3/depth", async (req, res) => {
  try {
    const response = await axios.get(`${binanceBase}/api/v3/depth`, { params: req.query })
    return res.json(response.data)
  } catch (error) {
    const status = error?.response?.status || 500
    const payload = error?.response?.data || { message: error.message }
    return res.status(status).json(payload)
  }
})

app.listen(port, () => {
  console.log(`Binance proxy listening on http://localhost:${port}`)
})
