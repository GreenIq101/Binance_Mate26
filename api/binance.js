const axios = require("axios");
const CryptoJS = require("crypto-js");

const binanceBase = "https://api.binance.com";
const API_KEY = process.env.BINANCE_API_KEY || "";
const API_SECRET = process.env.BINANCE_API_SECRET || "";

const hasCredentials = () => API_KEY && API_SECRET;

const createSignature = (queryString) => {
  return CryptoJS.HmacSHA256(queryString, API_SECRET).toString();
};

const endpoints = {
  account: ["account", "openOrders"],
  public: ["ticker/price", "ticker/24hr", "exchangeInfo", "klines", "depth"],
};

export default async function handler(req, res) {
  const { path = "", ...query } = req.query;
  const rawPath = Array.isArray(path) ? path.join("/") : path;
  const normalizedPath = rawPath.replace(/^\/?api\/v3\//, "").replace(/^\/?v3\//, "");
  
  if (!normalizedPath) {
    return res.status(400).json({ error: "Missing path parameter" });
  }

  try {
    const needsSigning = endpoints.account.includes(normalizedPath);
    
    if (needsSigning && !hasCredentials()) {
      return res.status(500).json({ error: "Missing BINANCE_API_KEY or BINANCE_API_SECRET" });
    }

    const queryParams = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined) queryParams.append(key, value);
    });

    let url;
    let axiosHeaders = {};

    if (needsSigning) {
      const timestamp = Date.now();
      const queryStr = queryParams.toString() + `&timestamp=${timestamp}`;
      const signature = createSignature(queryStr);
      url = `${binanceBase}/api/v3/${normalizedPath}?${queryStr}&signature=${signature}`;
      axiosHeaders["X-MBX-APIKEY"] = API_KEY;
    } else {
      url = `${binanceBase}/api/v3/${normalizedPath}?${queryParams.toString()}`;
    }

    const response = await axios.get(url, { headers: axiosHeaders });
    return res.status(200).json(response.data);
  } catch (error) {
    const status = error?.response?.status || 500;
    const payload = error?.response?.data || { message: error.message };
    return res.status(status).json(payload);
  }
}
