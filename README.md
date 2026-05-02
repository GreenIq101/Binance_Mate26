# Binance Mate

A mobile application for cryptocurrency market analysis and trading signals.

## Features
- Firebase Authentication
- Market Scanning Algorithm
- Technical Indicators (RSI, MACD, EMA, Bollinger Bands)
- Signal Generation (BUY/SELL/HOLD)
- Data Persistence

## Deployment

This project is configured for Vercel deployment.

### Environment Variables
Set these in Vercel Dashboard:
- `BINANCE_API_KEY` - Binance API key
- `BINANCE_API_SECRET` - Binance API secret

### Deploy
```bash
vercel
```

### Local Development
```bash
npm run web
```