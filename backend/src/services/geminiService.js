// backend/src/services/geminiService.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;

const initGemini = () => {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI;
};

// ==========================================
// ANALYZE FRAUD THREAT WITH GEMINI
// ==========================================
const analyzeThreat = async (transaction) => {
  try {
    const ai = initGemini();
    if (!ai) {
      return buildFallbackSummary(transaction);
    }

    const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `You are a cybersecurity fraud analyst AI. Analyze this suspicious transaction and provide a concise threat assessment in JSON format.

Transaction Details:
- Amount: ₹${transaction.amount}
- Merchant: ${transaction.merchantName} (${transaction.merchantCategory})
- Location: ${transaction.location}
- Device: ${transaction.device}
- Risk Score: ${transaction.riskScore}/100
- Risk Level: ${transaction.riskLevel}
- AI Fraud Reason: ${transaction.fraudReason || 'Pattern anomaly detected'}
- Time: ${new Date(transaction.time || transaction.createdAt).toLocaleString()}

Respond ONLY with valid JSON in this exact format:
{
  "suspiciousReason": "Why transaction is suspicious (one concise sentence)",
  "explanation": "Detailed AI explanation (2-3 sentences max)",
  "confidenceScore": 95,
  "recommendedAction": "Action to take (e.g. Block account immediately)"
}`;

    const result = await model.generateContent(prompt);
    const text   = result.response.text().trim();

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return buildFallbackSummary(transaction);

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      ...parsed,
      generatedBy: 'gemini-2.0-flash',
      generatedAt: new Date().toISOString(),
      transactionId: transaction._id || transaction.id
    };
  } catch (err) {
    console.error('❌ Gemini error:', err.message);
    return buildFallbackSummary(transaction);
  }
};

// ==========================================
// INSIDER THREAT ANALYSIS
// ==========================================
const analyzeInsiderThreat = async (alert) => {
  try {
    const ai = initGemini();
    if (!ai) return buildInsiderFallback(alert);

    const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `As a SOC analyst AI, analyze this insider threat alert and provide a brief assessment.

Alert:
- Type: ${alert.activityType}
- Description: ${alert.description}
- Severity: ${alert.severity}
- Risk Score: ${alert.riskScore}/100

Respond ONLY with valid JSON:
{
  "threatLevel": "CRITICAL|HIGH|MEDIUM|LOW",
  "summary": "Brief threat summary under 80 chars",
  "motive": "Suspected motive in one phrase",
  "recommendation": "Immediate action required",
  "confidence": 0-100
}`;

    const result   = await model.generateContent(prompt);
    const text     = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return buildInsiderFallback(alert);

    return {
      ...JSON.parse(jsonMatch[0]),
      generatedBy: 'gemini-2.0-flash',
      generatedAt: new Date().toISOString()
    };
  } catch (err) {
    console.error('❌ Gemini insider error:', err.message);
    return buildInsiderFallback(alert);
  }
};

// ==========================================
// FALLBACK SUMMARIES (no API key)
// ==========================================
const buildFallbackSummary = (tx) => {
  const level = tx.riskScore >= 70 ? 'CRITICAL' : tx.riskScore >= 40 ? 'HIGH' : 'MEDIUM';
  return {
    suspiciousReason:   `${level} risk: ₹${tx.amount} at ${tx.merchantName} — anomaly detected`,
    explanation:        `Amount ₹${tx.amount} exceeds typical pattern. Location: ${tx.location}. ${tx.fraudReason || 'Behavioral anomaly'}`,
    confidenceScore:    tx.riskScore,
    recommendedAction:  'Review transaction and verify with account holder',
    generatedBy:    'rule-engine-fallback',
    generatedAt:    new Date().toISOString(),
    transactionId:  tx._id || tx.id
  };
};

const buildInsiderFallback = (alert) => ({
  threatLevel:    alert.severity,
  summary:        `${alert.severity} insider activity: ${alert.activityType.replace(/_/g, ' ')}`,
  motive:         'Unauthorized access or data exfiltration',
  recommendation: 'Investigate immediately and escalate to security team',
  confidence:     alert.riskScore,
  generatedBy:    'rule-engine-fallback',
  generatedAt:    new Date().toISOString()
});

module.exports = { analyzeThreat, analyzeInsiderThreat };
