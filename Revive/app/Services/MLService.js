import AsyncStorage from "@react-native-async-storage/async-storage"
import * as tf from "@tensorflow/tfjs"
import { Platform } from "react-native"

class MLService {
  constructor() {
    this.model = null
    this.scaler = null
    this.isModelLoaded = false
    this.isInitialized = false
    this.initializePromise = null
    this.hasWarnedModelUnavailable = false
    this.sequenceLength = 60
  }

  async initialize() {
    if (this.isInitialized) return true
    if (this.initializePromise) return this.initializePromise

    this.initializePromise = (async () => {
    try {
      if (Platform.OS !== "web") {
        await import("@tensorflow/tfjs-react-native")
      }

      // Initialize TensorFlow
      await tf.ready()

      // Try to load existing model
      await this.loadModel()

      this.isInitialized = true
      console.log("ML Service initialized")
      return true
    } catch (error) {
      console.error("Failed to initialize ML Service:", error)
      return false
    } finally {
      this.initializePromise = null
    }
    })()

    return this.initializePromise
  }

  async loadModel() {
    try {
      // Check if model exists in AsyncStorage
      const modelData = await AsyncStorage.getItem("binance_model")
      const scalerData = await AsyncStorage.getItem("model_scaler")

      if (modelData && scalerData) {
        // Load model from storage
        this.model = await tf.loadLayersModel("localstorage://binance-model")
        this.scaler = JSON.parse(scalerData)
        this.isModelLoaded = true

        console.log("Model loaded from storage")
        return true
      }

      return false
    } catch (error) {
      console.error("Failed to load model:", error)
      return false
    }
  }

  async saveModel() {
    try {
      if (this.model) {
        await this.model.save("localstorage://binance-model")
        await AsyncStorage.setItem("binance_model", "saved")
        await AsyncStorage.setItem("model_scaler", JSON.stringify(this.scaler))

        console.log("Model saved to storage")
      }
    } catch (error) {
      console.error("Failed to save model:", error)
    }
  }

  async trainModel(trainingData) {
    try {
      if (!trainingData || trainingData.length === 0) {
        console.log("No training data available")
        return false
      }

      console.log(`Training model with ${trainingData.length} samples`)

      // Prepare features
      const { X, y } = this.prepareFeatures(trainingData)

      if (!X || !y) {
        console.log("Failed to prepare features")
        return false
      }

      // Build model
      this.model = this.buildModel([this.sequenceLength, X.shape[2]])

      // Train model
      await this.model.fit(X, y, {
        epochs: 50,
        batchSize: 32,
        validationSplit: 0.2,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            console.log(`Epoch ${epoch + 1}: loss = ${logs.loss.toFixed(4)}`)
          },
        },
      })

      // Save model
      await this.saveModel()
      this.isModelLoaded = true

      console.log("Model training completed")
      return true
    } catch (error) {
      console.error("Model training failed:", error)
      return false
    }
  }

  prepareFeatures(data) {
    try {
      // Extract features
      const features = data.map((item) => [
        item.open_price,
        item.high_price,
        item.low_price,
        item.close_price,
        item.volume,
        item.rsi || 50,
        item.macd || 0,
        item.ema_12 || item.close_price,
        item.ema_26 || item.close_price,
        item.bollinger_upper || item.close_price * 1.02,
        item.bollinger_lower || item.close_price * 0.98,
      ])

      // Normalize features
      const normalizedFeatures = this.normalizeFeatures(features)

      // Create sequences
      const X = []
      const y = []

      for (let i = this.sequenceLength; i < normalizedFeatures.length; i++) {
        X.push(normalizedFeatures.slice(i - this.sequenceLength, i))
        y.push(data[i].target || data[i].close_price)
      }

      return {
        X: tf.tensor3d(X),
        y: tf.tensor1d(y),
      }
    } catch (error) {
      console.error("Feature preparation failed:", error)
      return { X: null, y: null }
    }
  }

  normalizeFeatures(features) {
    // Simple min-max normalization
    const transposed = features[0].map((_, colIndex) => features.map((row) => row[colIndex]))

    const normalized = transposed.map((column) => {
      const min = Math.min(...column)
      const max = Math.max(...column)
      const range = max - min

      return column.map((value) => (range === 0 ? 0 : (value - min) / range))
    })

    // Transpose back
    return normalized[0].map((_, rowIndex) => normalized.map((column) => column[rowIndex]))
  }

  buildModel(inputShape) {
    const model = tf.sequential({
      layers: [
        tf.layers.lstm({
          units: 50,
          returnSequences: true,
          inputShape: inputShape,
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.lstm({
          units: 50,
          returnSequences: true,
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.lstm({
          units: 50,
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 25 }),
        tf.layers.dense({ units: 1 }),
      ],
    })

    model.compile({
      optimizer: "adam",
      loss: "meanSquaredError",
      metrics: ["mae"],
    })

    return model
  }

  async predict(features) {
    try {
      await this.initialize()

      if (!this.isModelLoaded || !this.model) {
        if (!this.hasWarnedModelUnavailable) {
          console.log("Model not loaded, using default prediction")
          this.hasWarnedModelUnavailable = true
        }
        return this.defaultPredict(features)
      }

      // Normalize features
      const normalizedFeatures = this.normalizeFeatures([features])

      // Make prediction
      const prediction = this.model.predict(tf.tensor3d([normalizedFeatures]))
      const result = await prediction.data()

      return result[0]
    } catch (error) {
      console.error("Prediction failed:", error)
      return this.defaultPredict(features)
    }
  }

  defaultPredict(features) {
    // Default prediction logic when ML model is not available
    const currentPrice = features[3] // close_price
    const rsi = features[5] || 50
    const volume = features[4] || 1000000

    // Simple technical analysis based prediction
    let prediction = currentPrice

    if (rsi < 30) {
      // Oversold, predict price increase
      prediction = currentPrice * 1.02
    } else if (rsi > 70) {
      // Overbought, predict price decrease
      prediction = currentPrice * 0.98
    } else {
      // Neutral, small random movement
      prediction = currentPrice * (1 + (Math.random() - 0.5) * 0.01)
    }

    return prediction
  }

  async savePrediction(symbol, price, predictedPrice, predictionType, features) {
    try {
      const prediction = {
        id: Date.now(),
        symbol,
        timestamp: new Date().toISOString(),
        price,
        predictedPrice,
        predictionType,
        features,
        accuracy: null,
        actualPrice: null,
      }

      // Save to AsyncStorage
      const existingPredictions = await AsyncStorage.getItem("predictions")
      const predictions = existingPredictions ? JSON.parse(existingPredictions) : []

      predictions.push(prediction)

      // Keep only last 1000 predictions
      if (predictions.length > 1000) {
        predictions.splice(0, predictions.length - 1000)
      }

      await AsyncStorage.setItem("predictions", JSON.stringify(predictions))

      return prediction.id
    } catch (error) {
      console.error("Failed to save prediction:", error)
      return null
    }
  }

  async updatePredictionAccuracy(predictionId, actualPrice) {
    try {
      const existingPredictions = await AsyncStorage.getItem("predictions")
      if (!existingPredictions) return

      const predictions = JSON.parse(existingPredictions)
      const predictionIndex = predictions.findIndex((p) => p.id === predictionId)

      if (predictionIndex !== -1) {
        const prediction = predictions[predictionIndex]
        prediction.actualPrice = actualPrice
        prediction.accuracy = 1 - Math.abs(prediction.predictedPrice - actualPrice) / actualPrice

        await AsyncStorage.setItem("predictions", JSON.stringify(predictions))
      }
    } catch (error) {
      console.error("Failed to update prediction accuracy:", error)
    }
  }

  async getTrainingData() {
    try {
      const trainingData = await AsyncStorage.getItem("training_data")
      return trainingData ? JSON.parse(trainingData) : []
    } catch (error) {
      console.error("Failed to get training data:", error)
      return []
    }
  }

  async saveTrainingData(data) {
    try {
      const existingData = await this.getTrainingData()
      const newData = [...existingData, ...data]

      // Keep only last 10000 records
      if (newData.length > 10000) {
        newData.splice(0, newData.length - 10000)
      }

      await AsyncStorage.setItem("training_data", JSON.stringify(newData))
    } catch (error) {
      console.error("Failed to save training data:", error)
    }
  }

  async checkAndRetrain() {
    try {
      const trainingData = await this.getTrainingData()
      const lastTraining = await AsyncStorage.getItem("last_training")

      const shouldRetrain =
        !lastTraining ||
        Date.now() - Number.parseInt(lastTraining) > 24 * 60 * 60 * 1000 || // 24 hours
        trainingData.length > 1000

      if (shouldRetrain && trainingData.length > 100) {
        console.log("Retraining model with new data...")
        const success = await this.trainModel(trainingData)

        if (success) {
          await AsyncStorage.setItem("last_training", Date.now().toString())
        }

        return success
      }

      return false
    } catch (error) {
      console.error("Failed to check and retrain:", error)
      return false
    }
  }
}

export default new MLService()
