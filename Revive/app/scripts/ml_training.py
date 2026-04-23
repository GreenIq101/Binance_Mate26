import tensorflow as tf
import numpy as np
import pandas as pd
import json
import os
from datetime import datetime, timedelta
import sqlite3
from sklearn.preprocessing import MinMaxScaler, LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
import joblib

class BinanceMLTrainer:
    def __init__(self, db_path="predictions.db", model_path="models/"):
        self.db_path = db_path
        self.model_path = model_path
        self.scaler = MinMaxScaler()
        self.label_encoder = LabelEncoder()
        self.model = None
        self.sequence_length = 60  # 60 time steps for LSTM
        
        # Create directories if they don't exist
        os.makedirs(model_path, exist_ok=True)
        
    def create_database(self):
        """Create database tables for storing predictions and training data"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Create predictions table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS predictions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                timestamp DATETIME NOT NULL,
                price REAL NOT NULL,
                predicted_price REAL,
                actual_price REAL,
                prediction_type TEXT,
                accuracy REAL,
                features TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create training_data table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS training_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                timestamp DATETIME NOT NULL,
                open_price REAL,
                high_price REAL,
                low_price REAL,
                close_price REAL,
                volume REAL,
                rsi REAL,
                macd REAL,
                ema_12 REAL,
                ema_26 REAL,
                bollinger_upper REAL,
                bollinger_lower REAL,
                price_change REAL,
                target REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
        
    def load_data_from_db(self):
        """Load training data from database"""
        conn = sqlite3.connect(self.db_path)
        
        # Load training data
        training_query = '''
            SELECT symbol, timestamp, open_price, high_price, low_price, close_price,
                   volume, rsi, macd, ema_12, ema_26, bollinger_upper, bollinger_lower,
                   price_change, target
            FROM training_data
            ORDER BY symbol, timestamp
        '''
        
        training_df = pd.read_sql_query(training_query, conn)
        
        # Load predictions for accuracy calculation
        predictions_query = '''
            SELECT symbol, predicted_price, actual_price, accuracy
            FROM predictions
            WHERE actual_price IS NOT NULL
        '''
        
        predictions_df = pd.read_sql_query(predictions_query, conn)
        
        conn.close()
        
        return training_df, predictions_df
    
    def prepare_features(self, df):
        """Prepare features for training"""
        if df.empty:
            return None, None
        
        # Feature engineering
        features = ['open_price', 'high_price', 'low_price', 'close_price', 'volume',
                   'rsi', 'macd', 'ema_12', 'ema_26', 'bollinger_upper', 'bollinger_lower']
        
        # Fill missing values
        df[features] = df[features].fillna(method='ffill').fillna(method='bfill')
        
        # Scale features
        scaled_features = self.scaler.fit_transform(df[features])
        
        # Create sequences for LSTM
        X, y = [], []
        for i in range(self.sequence_length, len(scaled_features)):
            X.append(scaled_features[i-self.sequence_length:i])
            y.append(df['target'].iloc[i])
        
        return np.array(X), np.array(y)
    
    def build_model(self, input_shape):
        """Build LSTM model for price prediction"""
        model = tf.keras.Sequential([
            tf.keras.layers.LSTM(50, return_sequences=True, input_shape=input_shape),
            tf.keras.layers.Dropout(0.2),
            tf.keras.layers.LSTM(50, return_sequences=True),
            tf.keras.layers.Dropout(0.2),
            tf.keras.layers.LSTM(50),
            tf.keras.layers.Dropout(0.2),
            tf.keras.layers.Dense(25),
            tf.keras.layers.Dense(1)
        ])
        
        model.compile(optimizer='adam', loss='mean_squared_error', metrics=['mae'])
        return model
    
    def train_model(self, retrain=False):
        """Train the ML model"""
        print("Loading data from database...")
        training_df, predictions_df = self.load_data_from_db()
        
        if training_df.empty:
            print("No training data available. Using default logic.")
            return False
        
        print(f"Found {len(training_df)} training samples")
        
        # Check if we should retrain
        model_exists = os.path.exists(f"{self.model_path}binance_model.h5")
        
        if model_exists and not retrain:
            print("Model exists and retrain=False. Loading existing model.")
            self.load_model()
            return True
        
        # Prepare features
        X, y = self.prepare_features(training_df)
        
        if X is None:
            print("Failed to prepare features. Using default logic.")
            return False
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        
        print(f"Training on {len(X_train)} samples, testing on {len(X_test)} samples")
        
        # Build model
        self.model = self.build_model((X_train.shape[1], X_train.shape[2]))
        
        # Train model
        history = self.model.fit(
            X_train, y_train,
            batch_size=32,
            epochs=50,
            validation_data=(X_test, y_test),
            verbose=1,
            callbacks=[
                tf.keras.callbacks.EarlyStopping(patience=10, restore_best_weights=True),
                tf.keras.callbacks.ReduceLROnPlateau(patience=5, factor=0.5)
            ]
        )
        
        # Evaluate model
        train_loss = self.model.evaluate(X_train, y_train, verbose=0)
        test_loss = self.model.evaluate(X_test, y_test, verbose=0)
        
        print(f"Training Loss: {train_loss}")
        print(f"Testing Loss: {test_loss}")
        
        # Save model and scaler
        self.save_model()
        
        return True
    
    def save_model(self):
        """Save the trained model and scaler"""
        self.model.save(f"{self.model_path}binance_model.h5")
        joblib.dump(self.scaler, f"{self.model_path}scaler.pkl")
        
        # Save model metadata
        metadata = {
            'sequence_length': self.sequence_length,
            'trained_at': datetime.now().isoformat(),
            'model_version': '1.0'
        }
        
        with open(f"{self.model_path}metadata.json", 'w') as f:
            json.dump(metadata, f)
        
        print("Model saved successfully!")
    
    def load_model(self):
        """Load the trained model and scaler"""
        try:
            self.model = tf.keras.models.load_model(f"{self.model_path}binance_model.h5")
            self.scaler = joblib.load(f"{self.model_path}scaler.pkl")
            
            with open(f"{self.model_path}metadata.json", 'r') as f:
                metadata = json.load(f)
                self.sequence_length = metadata['sequence_length']
            
            print("Model loaded successfully!")
            return True
        except Exception as e:
            print(f"Failed to load model: {e}")
            return False
    
    def predict(self, features):
        """Make predictions using the trained model"""
        if self.model is None:
            if not self.load_model():
                return None
        
        try:
            # Scale features
            scaled_features = self.scaler.transform(features)
            
            # Make prediction
            prediction = self.model.predict(scaled_features)
            
            return prediction[0][0] if len(prediction) > 0 else None
        except Exception as e:
            print(f"Prediction error: {e}")
            return None
    
    def save_prediction(self, symbol, price, predicted_price, prediction_type, features):
        """Save prediction to database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO predictions (symbol, timestamp, price, predicted_price, prediction_type, features)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (symbol, datetime.now(), price, predicted_price, prediction_type, json.dumps(features)))
        
        conn.commit()
        conn.close()
    
    def update_prediction_accuracy(self, prediction_id, actual_price):
        """Update prediction with actual price and calculate accuracy"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Get prediction
        cursor.execute('SELECT predicted_price FROM predictions WHERE id = ?', (prediction_id,))
        result = cursor.fetchone()
        
        if result:
            predicted_price = result[0]
            accuracy = 1 - abs(predicted_price - actual_price) / actual_price
            
            cursor.execute('''
                UPDATE predictions 
                SET actual_price = ?, accuracy = ?
                WHERE id = ?
            ''', (actual_price, accuracy, prediction_id))
            
            conn.commit()
        
        conn.close()

# Main execution
if __name__ == "__main__":
    trainer = BinanceMLTrainer()
    trainer.create_database()
    
    # Train the model
    success = trainer.train_model(retrain=True)
    
    if success:
        print("Model training completed successfully!")
    else:
        print("Model training failed. Using default logic.")

# Have to install
# pip install tensorflow pandas scikit-learn joblib