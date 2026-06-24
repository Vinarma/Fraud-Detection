// backend/src/routes/geoip.js
// Returns IPInfo geo intelligence for a given IP address
const express  = require('express');
const { authMiddleware } = require('../middleware/auth');
const { lookupIP, assessGeoRisk } = require('../services/geoService');

const router = express.Router();

// Simple in-memory cache (5 min TTL) to avoid burning API quota
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

const getCached = (ip) => {
  const entry = cache.get(ip);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(ip); return null; }
  return entry.data;
};

const setCache = (ip, data) => {
  cache.set(ip, { data, ts: Date.now() });
  // Limit cache size
  if (cache.size > 500) cache.delete(cache.keys().next().value);
};

// ============================================================================
// GET /api/geoip/:ip
// Lookup full geo intelligence for an IP address
// ============================================================================
router.get('/:ip', authMiddleware, async (req, res) => {
  const { ip } = req.params;

  // Basic IP validation
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-fA-F:]+$/;
  if (!ipv4.test(ip) && !ipv6.test(ip)) {
    return res.status(400).json({ error: 'Invalid IP address format' });
  }

  // Private / loopback → skip external lookup
  const isPrivate =
    ip === '127.0.0.1' || ip === '::1' ||
    ip.startsWith('192.168.') || ip.startsWith('10.') ||
    ip.startsWith('172.16.')  || ip.startsWith('172.17.') ||
    ip.startsWith('169.254.') || ip === 'localhost';

  if (isPrivate) {
    return res.json({
      ip,
      isPrivate: true,
      location: 'Local Network',
      city: 'Private',
      country: '--',
      org: 'Local Network',
      isVPN: false, isTor: false, isProxy: false, isHosting: false,
      riskScore: 0, riskFlags: [],
      source: 'local'
    });
  }

  // Check cache
  const cached = getCached(ip);
  if (cached) {
    return res.json({ ...cached, source: 'cache' });
  }

  if (!process.env.IPINFO_TOKEN) {
    return res.status(503).json({
      error: 'IPInfo not configured',
      ip,
      location: 'Unknown',
      note: 'Set IPINFO_TOKEN in .env to enable geo lookup'
    });
  }

  try {
    const geoData = await lookupIP(ip);
    if (!geoData) {
      return res.status(404).json({ error: 'Could not resolve IP', ip });
    }

    const { score: riskScore, flags: riskFlags } = assessGeoRisk(geoData);

    // Parse lat/lon
    let lat = null, lon = null;
    if (geoData.loc) {
      const parts = geoData.loc.split(',');
      lat = parseFloat(parts[0]);
      lon = parseFloat(parts[1]);
    }

    const result = {
      ip:         geoData.ip,
      city:       geoData.city,
      region:     geoData.region,
      country:    geoData.country,
      org:        geoData.org,
      timezone:   geoData.timezone,
      location:   geoData.location,
      lat,
      lon,
      mapUrl:     lat && lon ? `https://maps.google.com/?q=${lat},${lon}` : null,
      ipinfoUrl:  `https://ipinfo.io/${ip}`,
      // Privacy flags
      isVPN:      geoData.isVPN,
      isTor:      geoData.isTor,
      isProxy:    geoData.isProxy,
      isHosting:  geoData.isHosting,
      // Risk assessment
      riskScore,
      riskFlags,
      riskLevel:  riskScore >= 70 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW',
      source:     'ipinfo'
    };

    setCache(ip, result);
    res.json(result);

  } catch (err) {
    console.error(`❌ GeoIP error for ${ip}:`, err.message);
    res.status(500).json({ error: 'GeoIP lookup failed', message: err.message, ip });
  }
});

module.exports = router;
