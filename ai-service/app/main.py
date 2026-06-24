# ai-service/app/main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
import os
from dotenv import load_dotenv
from .model import FraudDetectionModel
 
# Load environment variables
load_dotenv()
 
# ==========================================
# FASTAPI APP INITIALIZATION
# ==========================================
app = FastAPI(
    title="FraudTracker-AI Service",
    description="Real-time fraud detection and risk scoring engine",
    version="1.0.0"
)
 
# ==========================================
# CORS MIDDLEWARE
# ==========================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:4000",
        "http://localhost:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
 
# ==========================================
# INITIALIZE FRAUD DETECTION MODEL
# ==========================================
fraud_model = FraudDetectionModel()
 
# ==========================================
# REQUEST/RESPONSE MODELS
# ==========================================
class TransactionRequest(BaseModel):
    """Transaction data for fraud prediction"""
    amount: float
    time: str
    location: str
    device: str
    merchant_name: str = None
    merchant_category: str = None
    user_history: dict = None
 
class RiskResponse(BaseModel):
    """Fraud risk prediction response"""
    risk_score: float
    risk_level: str  # "LOW", "MEDIUM", "HIGH"
    fraud_probability: float
    is_fraudulent: bool
    reason: str
    timestamp: str
 
# ==========================================
# HEALTH CHECK ENDPOINT
# ==========================================
@app.get("/health")
async def health_check():
    """Check if AI service is running"""
    return {
        "status": "✅ FraudTracker-AI Service is running",
        "timestamp": datetime.now().isoformat(),
        "service": "Fraud Detection Engine",
        "version": "1.0.0"
    }
 
# ==========================================
# FRAUD PREDICTION ENDPOINT
# ==========================================
@app.post("/predict", response_model=RiskResponse)
async def predict_fraud(transaction: TransactionRequest):
    """
    Predict fraud risk for a transaction
    
    Args:
        transaction: TransactionRequest object with transaction details
    
    Returns:
        RiskResponse with fraud prediction and risk score
    """
    try:
        # Get fraud prediction from model
        prediction = fraud_model.predict(
            amount=transaction.amount,
            time=transaction.time,
            location=transaction.location,
            device=transaction.device,
            merchant_name=transaction.merchant_name,
            merchant_category=transaction.merchant_category,
            user_history=transaction.user_history
        )
        
        return RiskResponse(
            risk_score=prediction['risk_score'],
            risk_level=prediction['risk_level'],
            fraud_probability=prediction['fraud_probability'],
            is_fraudulent=prediction['is_fraudulent'],
            reason=prediction['reason'],
            timestamp=datetime.now().isoformat()
        )
    
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error in fraud prediction: {str(e)}"
        )
 
# ==========================================
# BATCH PREDICTION ENDPOINT
# ==========================================
@app.post("/predict-batch")
async def predict_batch(transactions: list[TransactionRequest]):
    """
    Predict fraud risk for multiple transactions
    
    Args:
        transactions: List of TransactionRequest objects
    
    Returns:
        List of RiskResponse objects
    """
    predictions = []
    
    for transaction in transactions:
        try:
            prediction = fraud_model.predict(
                amount=transaction.amount,
                time=transaction.time,
                location=transaction.location,
                device=transaction.device,
                merchant_name=transaction.merchant_name,
                merchant_category=transaction.merchant_category,
                user_history=transaction.user_history
            )
            
            predictions.append({
                "risk_score": prediction['risk_score'],
                "risk_level": prediction['risk_level'],
                "is_fraudulent": prediction['is_fraudulent'],
                "timestamp": datetime.now().isoformat()
            })
        
        except Exception as e:
            predictions.append({
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            })
    
    return {"predictions": predictions}
 
# ==========================================
# MODEL INFO ENDPOINT
# ==========================================
@app.get("/model-info")
async def model_info():
    """Get information about the fraud detection model"""
    return {
        "model_name": "FraudTracker-AI Detection Model",
        "model_type": "Rule-based + ML Ensemble",
        "version": "1.0.0",
        "features": [
            "Amount Analysis",
            "Temporal Patterns",
            "Location Anomalies",
            "Device Fingerprinting",
            "Merchant Categories",
            "User Behavior Analysis"
        ],
        "risk_thresholds": {
            "low": "0-40",
            "medium": "40-70",
            "high": "70-100"
        },
        "last_updated": "2024-01-15"
    }
 
# ==========================================
# ERROR HANDLER
# ==========================================
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler"""
    return {
        "error": str(exc),
        "timestamp": datetime.now().isoformat(),
        "path": request.url.path
    }
 
# ==========================================
# RUN SERVER (if executing directly)
# ==========================================
if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info"
    )