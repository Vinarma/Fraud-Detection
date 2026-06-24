// backend/src/services/geoService.js
// IP geolocation using IPInfo API
const axios = require('axios');

const IPINFO_TOKEN = process.env.IPINFO_TOKEN;

/**
 * Look up geolocation for an IP address
 * Returns: { city, region, country, org, timezone, loc }
 */
const lookupIP = async (ip) => {
  if (!IPINFO_TOKEN || !ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168') || ip.startsWith('10.')) {
    return null; // Skip private/loopback IPs
  }

  try {
    const res = await axios.get(`https://ipinfo.io/${ip}?token=${IPINFO_TOKEN}`, {
      timeout: 3000
    });

    const data = res.data;
    return {
      ip:       data.ip,
      city:     data.city     || 'Unknown',
      region:   data.region   || '',
      country:  data.country  || 'Unknown',
      org:      data.org      || '',
      timezone: data.timezone || '',
      loc:      data.loc      || '',        // "lat,lon"
      location: data.city ? `${data.city}, ${data.country}` : data.country || 'Unknown',
      isVPN:    data.privacy?.vpn  || false,
      isTor:    data.privacy?.tor  || false,
      isProxy:  data.privacy?.proxy || false,
      isHosting: data.privacy?.hosting || false
    };
  } catch (err) {
    console.warn(`⚠️ GeoIP lookup failed for ${ip}:`, err.message);
    return null;
  }
};

/**
 * Assess risk from geo data
 */
const assessGeoRisk = (geoData) => {
  if (!geoData) return { score: 0, flags: [] };

  const flags = [];
  let score   = 0;

  if (geoData.isTor)    { score += 40; flags.push('Tor exit node'); }
  if (geoData.isVPN)    { score += 30; flags.push('VPN detected'); }
  if (geoData.isProxy)  { score += 25; flags.push('Proxy detected'); }
  if (geoData.isHosting){ score += 15; flags.push('Hosting provider IP'); }

  const highRiskCountries = ['KP', 'IR', 'SY', 'CU', 'SD'];
  if (highRiskCountries.includes(geoData.country)) {
    score += 35; flags.push(`High-risk country: ${geoData.country}`);
  }

  return { score: Math.min(score, 100), flags };
};

// ==========================================
// IMPOSSIBLE TRAVEL DETECTION
// ==========================================
// Haversine distance in km
const getDistance = (loc1, loc2) => {
  if (!loc1 || !loc2) return 0;
  const [lat1, lon1] = loc1.split(',').map(Number);
  const [lat2, lon2] = loc2.split(',').map(Number);
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

const impossibleTravelCheck = (lastLoc, currentLoc, timeDiffHours) => {
  if (!lastLoc || !currentLoc || !timeDiffHours || timeDiffHours <= 0) return false;
  const distance = getDistance(lastLoc, currentLoc);
  const speed = distance / timeDiffHours;
  // If speed > 1000 km/h (commercial flight speed), it's impossible
  return speed > 1000;
};

module.exports = { lookupIP, assessGeoRisk, impossibleTravelCheck, getDistance };
