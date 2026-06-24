# Fraud Detection

A comprehensive fraud detection system consisting of an AI service, backend API, and a frontend interface.

## Prerequisites

- Node.js & npm
- Python 3.x
- [Stripe CLI](https://stripe.com/docs/stripe-cli)

## Repository

[https://github.com/Vinarma/Fraud-Detection.git](https://github.com/Vinarma/Fraud-Detection.git)

## Getting Started

To run the project locally, you will need to start the different services in separate terminal windows.

### 1. AI Service

Activate the virtual environment and start the Python AI service:

```powershell
.\venv\Scripts\Activate.ps1 
cd ai-service
pip install -r requirements.txt                      
python run.py 
```

### 2. Stripe Webhooks

You need the Stripe CLI to forward events to the local backend. Open two new PowerShell windows.

**Window 1: Trigger a test event**
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
& c:\Projects\.venv\Scripts\Activate.ps1
& "C:\stripe-cli\stripe.exe" trigger payment_intent.succeeded
```

**Window 2: Listen for Stripe events**
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
& c:\Projects\.venv\Scripts\Activate.ps1
& "C:\stripe-cli\stripe.exe" listen --forward-to localhost:4000/api/webhooks/stripe
```

*(Note: The `Set-ExecutionPolicy` commands ensure that scripts can be executed in the current PowerShell process.)*

### 3. Backend

Open a new terminal to start the backend server:

```powershell
cd backend
npm install
npm run dev
```

### 4. Frontend

Open a new terminal to start the frontend application:

```powershell
cd frontend
npm install
npm run dev
```
