#!/usr/bin/env python
# ai-service/run.py
"""
Convenience script to run FraudTracker-AI service
"""
import uvicorn
import os
from dotenv import load_dotenv
 
# Load environment variables
load_dotenv()
 
if __name__ == "__main__":
    port = int(os.getenv('PORT', 8001))
    
    print("""
╔════════════════════════════════════════╗
║  🤖 FRAUDTRACKER-AI SERVICE STARTING   ║
╚════════════════════════════════════════╝
    """)
    
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )
 