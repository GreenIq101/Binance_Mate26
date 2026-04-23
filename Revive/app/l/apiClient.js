// Binance API Client
// Browser-safe client (routes private calls through local proxy)

import axios from 'axios';
const BASE_URL = process.env.EXPO_PUBLIC_BINANCE_PROXY_URL || 'http://localhost:4000';

// Axios Client
const client = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

const normalizeProxyError = (error) => {
  if (error?.code === "ERR_NETWORK" || error?.code === "ECONNREFUSED") {
    const e = new Error(
      "Cannot connect to Binance proxy. Start it with: npm run proxy"
    )
    e.code = "PROXY_UNREACHABLE"
    throw e
  }
  throw error
}

// API Endpoints
export const getAccount = async () => {
  try {
    const res = await client.get('/api/v3/account');
    return res.data;
  } catch (error) {
    normalizeProxyError(error)
  }
};

export const getBalance = async () => {
  const account = await getAccount();
  return account.balances?.filter(b => parseFloat(b.free) > 0) || [];
};

export const getOpenOrders = async (symbol = 'BTCUSDT') => {
  try {
    const res = await client.get('/api/v3/openOrders', { params: { symbol } });
    return res.data;
  } catch (error) {
    normalizeProxyError(error)
  }
};

export const getTicker = async (symbol = 'BTCUSDT') => {
  const res = await client.get(`/api/v3/ticker/price?symbol=${symbol}`);
  return res.data;
};

export const get24hrTicker = async (symbol = 'BTCUSDT') => {
  const res = await client.get(`/api/v3/ticker/24hr?symbol=${symbol}`);
  return res.data;
};

export const getExchangeInfo = async () => {
  const res = await client.get(`/api/v3/exchangeInfo`);
  return res.data;
};

export const getAllTickers = async () => {
  const res = await client.get('/api/v3/ticker/price');
  return res.data;
};

export const getKlines = async (symbol = 'BTCUSDT', interval = '5m', limit = 30) => {
  const res = await client.get(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  return res.data;
};

export const getDepth = async (symbol = 'BTCUSDT', limit = 20) => {
  const res = await client.get(`/api/v3/depth?symbol=${symbol}&limit=${limit}`);
  return res.data;
};

export default {
  getAccount,
  getBalance,
  getOpenOrders,
  getTicker,
  get24hrTicker,
  getExchangeInfo,
  getAllTickers,
  getKlines,
  getDepth,
};
