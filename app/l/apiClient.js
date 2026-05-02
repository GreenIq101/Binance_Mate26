// Binance API Client
// Routes through Vercel API in production, local proxy in development

import axios from 'axios';
const isWeb = typeof window !== 'undefined';
const isDevWeb = isWeb && process.env.NODE_ENV === 'development';
const BASE_URL = isDevWeb
  ? `${window.location.protocol}//${window.location.hostname}:4000`
  : !isWeb
    ? 'http://localhost:4000'
    : '';

// Axios Client
const client = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

const normalizeError = (error) => {
  if (error?.code === "ERR_NETWORK" || error?.code === "ECONNREFUSED") {
    const e = new Error(
      "Cannot connect to API"
    )
    e.code = "PROXY_UNREACHABLE"
    throw e
  }

  if (error?.response?.data?.error || error?.response?.data?.message) {
    const e = new Error(error.response.data.error || error.response.data.message)
    e.code = error.response.data.binanceCode || error.response.status
    e.status = error.response.status
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
    normalizeError(error)
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
    normalizeError(error)
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
