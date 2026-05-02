// Simple Node.js script to test Binance API - fetch balance and open orders
const crypto = require('crypto');
const https = require('https');

// Load API keys from API.txt
const fs = require('fs');
const path = require('path');

function loadKeys() {
  try {
    const apiTxtPath = path.resolve(__dirname, 'API.txt');
    if (!fs.existsSync(apiTxtPath)) {
      console.error('API.txt not found!');
      process.exit(1);
    }
    
    const content = fs.readFileSync(apiTxtPath, 'utf8');
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    
    const keyIndex = lines.findIndex(l => /API\s*Key/i.test(l));
    const secretIndex = lines.findIndex(l => /Secret\s*Key/i.test(l));
    
    return {
      key: keyIndex >= 0 ? lines[keyIndex + 1] || '' : '',
      secret: secretIndex >= 0 ? lines[secretIndex + 1] || '' : ''
    };
  } catch (error) {
    console.error('Failed to load API keys:', error.message);
    process.exit(1);
  }
}

const { key: API_KEY, secret: API_SECRET } = loadKeys();

if (!API_KEY || !API_SECRET) {
  console.error('API Key or Secret not found in API.txt');
  process.exit(1);
}

console.log('API Key loaded:', API_KEY.substring(0, 10) + '...');
console.log('API Secret loaded:', API_SECRET.substring(0, 10) + '...\n');

// Helper function to make signed requests to Binance
function binanceRequest(method, endpoint, params = {}) {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    const queryString = new URLSearchParams({ ...params, timestamp }).toString();
    const signature = crypto.createHmac('sha256', API_SECRET).update(queryString).digest('hex');
    
    const fullQuery = `${queryString}&signature=${signature}`;
    const options = {
      hostname: 'api.binance.com',
      port: 443,
      path: `${endpoint}?${fullQuery}`,
      method: method,
      headers: {
        'X-MBX-APIKEY': API_KEY
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.code && parsed.msg) {
            reject(new Error(`Binance Error ${parsed.code}: ${parsed.msg}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', (error) => reject(error));
    req.end();
  });
}

// Fetch account balance
async function getBalance() {
  try {
    console.log('Fetching account balance...\n');
    const account = await binanceRequest('GET', '/api/v3/account');
    
    const balances = account.balances
      .filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .map(b => ({
        asset: b.asset,
        free: parseFloat(b.free).toFixed(4),
        locked: parseFloat(b.locked).toFixed(4),
        total: (parseFloat(b.free) + parseFloat(b.locked)).toFixed(4)
      }));
    
    console.log('=== Account Balance ===');
    console.table(balances);
    return account;
  } catch (error) {
    console.error('Failed to fetch balance:', error.message);
    throw error;
  }
}

// Fetch open orders
async function getOpenOrders(symbol = null) {
  try {
    console.log('\nFetching open orders...\n');
    const params = symbol ? { symbol } : {};
    const orders = await binanceRequest('GET', '/api/v3/openOrders', params);
    
    if (orders.length === 0) {
      console.log('No open orders found.');
    } else {
      console.log(`=== Open Orders (${orders.length}) ===`);
      orders.forEach((order, i) => {
        console.log(`\n${i + 1}. ${order.symbol} ${order.side} ${order.type}`);
        console.log(`   Price: ${order.price}`);
        console.log(`   Quantity: ${order.origQty}`);
        console.log(`   Executed: ${order.executedQty}`);
        console.log(`   Status: ${order.status}`);
        console.log(`   Order ID: ${order.orderId}`);
      });
    }
    return orders;
  } catch (error) {
    console.error('Failed to fetch open orders:', error.message);
    throw error;
  }
}

// Main function
async function main() {
  try {
    await getBalance();
    await getOpenOrders();
    
    // Optional: fetch orders for specific symbol
    // await getOpenOrders('BTCUSDT');
    
    console.log('\nDone!');
  } catch (error) {
    console.error('\nError:', error.message);
    process.exit(1);
  }
}

main();
