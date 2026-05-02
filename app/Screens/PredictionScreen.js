import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import apiClient from '../l/apiClient';

const PredictionScreen = () => {
  const [spikePairs, setSpikePairs] = useState([]);
  const [currentScanning, setCurrentScanning] = useState('');
  const [lastScanned, setLastScanned] = useState('');

  useEffect(() => {
    const interval = setInterval(scanMarket, 60000); // Scan market every 1 minute
    scanMarket(); // Initial scan on load
    return () => clearInterval(interval);
  }, []);

  const scanMarket = async () => {
    try {
      const exchangeInfo = await apiClient.getExchangeInfo();
      const usdtPairs = exchangeInfo.symbols
        .filter(symbol => symbol.quoteAsset === 'USDT')
        .map(symbol => symbol.symbol);

      let detectedSpikes = [];

      for (let i = 0; i < usdtPairs.length; i++) {
        const symbol = usdtPairs[i];
        setCurrentScanning(symbol);

        const response = await apiClient.getKlines(symbol, '1h', 51);

        const formattedData = response.map(item => ({
          time: new Date(item[0]).toLocaleTimeString(),
          close: parseFloat(item[4]),
          volume: parseFloat(item[5]),
        }));

        const spikeData = detectSpikes(formattedData);
        if (spikeData) {
          detectedSpikes.push({ symbol, ...spikeData });
        }

        setLastScanned(symbol);
      }

      detectedSpikes.sort((a, b) => Math.abs(b.volumeIncrease) - Math.abs(a.volumeIncrease));
      setSpikePairs(detectedSpikes.slice(0, 5));
      setCurrentScanning('');
    } catch (error) {
      console.error('Error fetching data:', error);
      setCurrentScanning('');
    }
  };

  const detectSpikes = (prices) => {
    if (prices.length < 11) return null;

    const lastVolume = prices[prices.length - 1].volume;
    const avgVolume = prices.slice(-11, -1).reduce((sum, item) => sum + item.volume, 0) / 10;
    const volumeIncrease = ((lastVolume - avgVolume) / avgVolume) * 100;

    const lastClose = prices[prices.length - 1].close;
    const secondLastClose = prices[prices.length - 2].close;
    const pastPriceChange = ((lastClose - secondLastClose) / secondLastClose) * 100;

    const predictedPriceChange = predictNextChange(prices);

    if (Math.abs(volumeIncrease) > 50 || Math.abs(pastPriceChange) > 5) {
      return {
        volumeIncrease: volumeIncrease.toFixed(2),
        pastPriceChange: pastPriceChange.toFixed(2),
        predictedPriceChange: predictedPriceChange.toFixed(2),
        lastClose: lastClose.toFixed(4),
      };
    }
    return null;
  };

  const predictNextChange = (prices) => {
    const last5Closes = prices.slice(-6, -1).map(p => p.close);
    const last5Changes = last5Closes.map((price, i) =>
      i === 0 ? 0 : ((price - last5Closes[i - 1]) / last5Closes[i - 1]) * 100
    ).slice(1);

    const avgChange = last5Changes.reduce((sum, val) => sum + val, 0) / last5Changes.length;
    return avgChange;
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.heading}>🔍 Top 5 Market Spikes</Text>

      {currentScanning ? (
        <Text style={styles.scanning}>Scanning: {currentScanning}...</Text>
      ) : (
        <Text style={styles.scanningDone}>Scanning complete.</Text>
      )}

      {lastScanned && <Text style={styles.lastScanned}>Last Scanned: {lastScanned}</Text>}

      {spikePairs.length > 0 ? (
        spikePairs.map(({ symbol, volumeIncrease, pastPriceChange, predictedPriceChange, lastClose }) => (
          <View
            key={symbol}
            style={[
              styles.spikeContainer,
              pastPriceChange > 0 ? styles.positive : styles.negative
            ]}
          >
            <Text style={styles.symbol}>{symbol}</Text>
            <Text>📊 Volume Spike: {volumeIncrease}%</Text>
            <Text>💰 Change (Last Hour): {pastPriceChange}%</Text>
            <Text>🔮 Next Change (Estimate): {predictedPriceChange}%</Text>
            <Text>🔹 Last Price: ${lastClose}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.noSpikes}>No major spikes detected.</Text>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  heading: { fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  scanning: { fontSize: 16, color: '#007bff', marginBottom: 5 },
  scanningDone: { fontSize: 16, color: '#28a745', marginBottom: 5 },
  lastScanned: { fontSize: 14, color: '#555', marginBottom: 10 },
  spikeContainer: {
    padding: 10,
    marginBottom: 10,
    borderRadius: 5,
  },
  positive: { backgroundColor: '#d4edda' }, // Green for positive spike
  negative: { backgroundColor: '#f8d7da' }, // Red for negative spike
  symbol: { fontSize: 18, fontWeight: 'bold' },
  noSpikes: { fontSize: 16, color: '#555' },
});

export default PredictionScreen;
