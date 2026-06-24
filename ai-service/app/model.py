# ai-service/app/model.py
from datetime import datetime
import json
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, IsolationForest
import xgboost as xgb
import warnings

warnings.filterwarnings('ignore')

class FraudDetectionModel:
    """
    ML Ensemble Fraud Detection model for FraudTracker-AI
    Uses Random Forest, XGBoost, and Isolation Forest.
    """
    
    def __init__(self):
        # Risk thresholds from environment
        self.amount_threshold = 10000
        self.early_hours_threshold = 6
        self.medium_risk_threshold = 40
        self.high_risk_threshold = 70
        
        # Device risk multiplier
        self.device_risk_multiplier = 1.5
        
        # Location risk
        self.risky_locations = ['Unknown', 'VPN', 'Proxy', 'TOR']
        
        # ML Models
        self.rf_model = RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42)
        self.xgb_model = xgb.XGBClassifier(n_estimators=100, max_depth=6, learning_rate=0.1, random_state=42)
        self.if_model = IsolationForest(n_estimators=100, contamination=0.1, random_state=42)
        
        self.is_trained = False
        self._train_synthetic_models()

    def _train_synthetic_models(self):
        """Generates synthetic data and trains the ensemble on startup to avoid needing static weights"""
        print("🔧 Training ML ensemble on synthetic dataset...")
        
        # Features: [amount, hour, is_weekend, is_risky_location, is_new_device, is_high_risk_merchant, 
        #            spend_velocity, ip_switches]
        np.random.seed(42)
        n_samples = 5000
        
        # Normal transactions (Class 0)
        normal_amount = np.random.lognormal(mean=np.log(500), sigma=1.0, size=int(n_samples * 0.9))
        normal_hour = np.random.randint(7, 23, size=int(n_samples * 0.9))
        normal_weekend = np.random.choice([0, 1], size=int(n_samples * 0.9), p=[0.75, 0.25])
        normal_loc = np.zeros(int(n_samples * 0.9))
        normal_device = np.random.choice([0, 1], size=int(n_samples * 0.9), p=[0.9, 0.1])
        normal_merchant = np.zeros(int(n_samples * 0.9))
        normal_spend = np.random.uniform(0, 1, size=int(n_samples * 0.9))  # ratio of normal spend
        normal_ip_switches = np.zeros(int(n_samples * 0.9))
        
        # Fraud transactions (Class 1)
        fraud_amount = np.random.lognormal(mean=np.log(15000), sigma=1.5, size=int(n_samples * 0.1))
        fraud_hour = np.random.randint(0, 6, size=int(n_samples * 0.1))
        fraud_weekend = np.random.choice([0, 1], size=int(n_samples * 0.1), p=[0.2, 0.8])
        fraud_loc = np.random.choice([0, 1], size=int(n_samples * 0.1), p=[0.2, 0.8])
        fraud_device = np.ones(int(n_samples * 0.1))
        fraud_merchant = np.random.choice([0, 1], size=int(n_samples * 0.1), p=[0.5, 0.5])
        fraud_spend = np.random.uniform(2, 10, size=int(n_samples * 0.1))
        fraud_ip_switches = np.random.randint(1, 5, size=int(n_samples * 0.1))
        
        X_normal = np.column_stack((normal_amount, normal_hour, normal_weekend, normal_loc, normal_device, normal_merchant, normal_spend, normal_ip_switches))
        X_fraud = np.column_stack((fraud_amount, fraud_hour, fraud_weekend, fraud_loc, fraud_device, fraud_merchant, fraud_spend, fraud_ip_switches))
        
        X = np.vstack((X_normal, X_fraud))
        y = np.hstack((np.zeros(len(X_normal)), np.ones(len(X_fraud))))
        
        # Shuffle
        idx = np.random.permutation(len(X))
        X = X[idx]
        y = y[idx]
        
        # Train
        self.rf_model.fit(X, y)
        self.xgb_model.fit(X, y)
        self.if_model.fit(X)
        
        self.is_trained = True
        print("✅ ML ensemble trained successfully!")

    def _extract_features(self, amount, time_str, location, device, merchant_category, user_history):
        """Convert raw inputs into feature array"""
        # Time processing
        try:
            transaction_time = datetime.fromisoformat(time_str.replace('Z', '+00:00'))
            hour = transaction_time.hour
            day_of_week = transaction_time.weekday()
            is_weekend = 1 if day_of_week >= 5 else 0
        except:
            hour = 12
            is_weekend = 0

        # Location processing
        is_risky_loc = 1 if location in self.risky_locations or "unknown" in location.lower() or "vpn" in location.lower() or "tor" in location.lower() else 0

        # Device processing
        is_new_device = 1
        if user_history:
            known_devices = user_history.get('known_devices', [])
            if device in known_devices:
                is_new_device = 0
                
        # Merchant processing
        high_risk_categories = ['Cryptocurrency', 'Wire Transfer', 'Money Transfer', 'Gambling', 'Adult Services', 'Foreign Exchange']
        is_high_risk_merchant = 1 if any(c.lower() in (merchant_category or '').lower() for c in high_risk_categories) else 0

        # Behavioral processing
        spend_velocity = 1.0
        ip_switches = 0
        if user_history:
            spend_velocity = user_history.get('spend_velocity', 1.0)
            ip_switches = user_history.get('ip_switches', 0)

        return np.array([[amount, hour, is_weekend, is_risky_loc, is_new_device, is_high_risk_merchant, spend_velocity, ip_switches]])

    def predict(self, amount, time, location, device, 
                merchant_name=None, merchant_category=None, user_history=None):
        """
        Predict fraud risk for a transaction using ML ensemble + Rule Base
        """
        
        # 1. Base Rules Assessment
        risk_score = 0
        risk_factors = []
        
        amount_risk = self._analyze_amount(amount)
        risk_score += amount_risk['score']
        if amount_risk['flagged']: risk_factors.append(amount_risk['reason'])
        
        time_risk = self._analyze_time(time)
        risk_score += time_risk['score']
        if time_risk['flagged']: risk_factors.append(time_risk['reason'])
        
        location_risk = self._analyze_location(location)
        risk_score += location_risk['score']
        if location_risk['flagged']: risk_factors.append(location_risk['reason'])
        
        device_risk = self._analyze_device(device, user_history)
        risk_score += device_risk['score']
        if device_risk['flagged']: risk_factors.append(device_risk['reason'])
        
        if merchant_category:
            merchant_risk = self._analyze_merchant(merchant_category)
            risk_score += merchant_risk['score']
            if merchant_risk['flagged']: risk_factors.append(merchant_risk['reason'])

        # 2. ML Ensemble Prediction
        ml_prob = 0.0
        if self.is_trained:
            features = self._extract_features(amount, time, location, device, merchant_category, user_history)
            
            rf_prob = self.rf_model.predict_proba(features)[0][1]
            xgb_prob = self.xgb_model.predict_proba(features)[0][1]
            if_pred = self.if_model.predict(features)[0] # 1 normal, -1 anomaly
            
            # Weighted ensemble
            ml_prob = (rf_prob * 0.4) + (xgb_prob * 0.6)
            if if_pred == -1:
                ml_prob += 0.2 # Boost anomaly score
                risk_factors.append("Isolation Forest detected severe structural anomaly")
                
            ml_score = ml_prob * 100
            
            # Blend Rules and ML (Adaptive rules)
            risk_score = (risk_score * 0.3) + (ml_score * 0.7)

        # 3. Finalization
        risk_score = min(100, max(0, risk_score))
        
        if risk_score >= self.high_risk_threshold:
            risk_level = "HIGH"
            fraud_probability = min(1.0, (risk_score - 70) / 30)
        elif risk_score >= self.medium_risk_threshold:
            risk_level = "MEDIUM"
            fraud_probability = (risk_score - 40) / 30
        else:
            risk_level = "LOW"
            fraud_probability = risk_score / 40
            
        is_fraudulent = risk_score >= self.high_risk_threshold
        
        # Build reason
        if not risk_factors:
            reason = "Normal transaction pattern"
        else:
            reason = " + ".join(risk_factors[:3])
            
        return {
            'risk_score': round(risk_score, 2),
            'risk_level': risk_level,
            'fraud_probability': round(float(fraud_probability), 4),
            'is_fraudulent': is_fraudulent,
            'reason': reason,
            'risk_factors': risk_factors
        }
    
    # --- Base Rules for Adaptive Blending ---
    def _analyze_amount(self, amount):
        score, flagged, reason = 0, False, ""
        if amount > self.amount_threshold:
            score, flagged, reason = 30, True, f"High amount: ₹{amount:,.2f}"
        elif amount > 5000:
            score, reason = 15, f"Medium amount: ₹{amount:,.2f}"
        return {'score': score, 'flagged': flagged, 'reason': reason}
    
    def _analyze_time(self, time_str):
        score, flagged, reason = 0, False, ""
        try:
            hour = datetime.fromisoformat(time_str.replace('Z','+00:00')).hour
            if hour < self.early_hours_threshold:
                score, flagged, reason = 20, True, f"Unusual time: {hour:02d}:00"
        except: pass
        return {'score': score, 'flagged': flagged, 'reason': reason}
    
    def _analyze_location(self, location):
        score, flagged, reason = 0, False, ""
        loc_lower = (location or '').lower()
        if any(x in loc_lower for x in ['vpn', 'tor', 'proxy']):
            score, flagged, reason = 25, True, f"Risky location: {location}"
        elif "unknown" in loc_lower:
            score, flagged, reason = 15, True, "Location unknown"
        return {'score': score, 'flagged': flagged, 'reason': reason}
    
    def _analyze_device(self, device, user_history=None):
        score, flagged, reason = 0, False, ""
        if user_history:
            known = user_history.get('known_devices', [])
            if device not in known:
                score, flagged, reason = int(20 * self.device_risk_multiplier), True, f"New device: {device}"
        else:
            score, reason = 15, f"Unregistered device: {device}"
        
        if any(kw in (device or '').lower() for kw in ['vpn', 'proxy', 'simulator']):
            score += 15
            flagged = True
            reason += " (Suspicious device)"
        return {'score': score, 'flagged': flagged, 'reason': reason}
    
    def _analyze_merchant(self, category):
        score, flagged, reason = 0, False, ""
        high_risk = ['Cryptocurrency', 'Wire Transfer', 'Gambling', 'Adult Services']
        for c in high_risk:
            if c.lower() in (category or '').lower():
                score, flagged, reason = 15, True, f"High-risk merchant: {category}"
                break
        return {'score': score, 'flagged': flagged, 'reason': reason}