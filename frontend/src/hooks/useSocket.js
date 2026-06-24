// frontend/src/hooks/useSocket.js
import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:4000';

export default function useSocket() {
  const socketRef  = useRef(null);
  const [connected, setConnected]         = useState(false);
  const [liveEvents, setLiveEvents]       = useState([]);
  const [aiThreatQueue, setAiThreatQueue] = useState([]);
  const [liveStats, setLiveStats]         = useState({
    transactionsThisHour: 0,
    fraudThisHour: 0,
    highRiskCount: 0
  });

  useEffect(() => {
    const token = localStorage.getItem('fraudtracker_token');
    if (!token) return;

    const socket = io(SOCKET_URL, {
      auth:       { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay:    2000
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      console.log('🔌 Socket connected:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      setConnected(false);
      console.log('🔌 Socket disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.warn('⚠️ Socket connect error:', err.message);
    });

    // ── New transaction received ──
    socket.on('transaction:new', (data) => {
      const event = {
        id:        Date.now() + Math.random(),
        type:      'transaction',
        riskLevel: data.riskLevel,
        title:     data.transaction?.merchantName || 'New Transaction',
        subtitle:  `₹${data.transaction?.amount?.toLocaleString()} — ${data.transaction?.merchantCategory}`,
        location:  data.transaction?.location,
        riskScore: data.transaction?.riskScore,
        isFraud:   data.transaction?.isFraudulent,
        isSimulated: data.isSimulated,
        stripeData:  data.stripeData,
        raw:       data.transaction,
        timestamp: new Date()
      };

      setLiveEvents(prev => [event, ...prev].slice(0, 50));

      setLiveStats(prev => ({
        transactionsThisHour: prev.transactionsThisHour + 1,
        fraudThisHour:   prev.fraudThisHour + (data.transaction?.isFraudulent ? 1 : 0),
        highRiskCount:   prev.highRiskCount  + (data.riskLevel === 'HIGH' ? 1 : 0)
      }));
    });

    // ── Insider alert received ──
    socket.on('alert:new', (data) => {
      const event = {
        id:        Date.now() + Math.random(),
        type:      'alert',
        severity:  data.alert?.severity,
        title:     (data.alert?.activityType || '').replace(/_/g, ' ').toUpperCase(),
        subtitle:  data.alert?.description,
        riskScore: data.alert?.riskScore,
        analysis:  data.analysis,
        raw:       data.alert,
        timestamp: new Date()
      };
      setLiveEvents(prev => [event, ...prev].slice(0, 50));
    });

    // ── Gemini AI threat summary ──
    socket.on('threat:ai', (data) => {
      setAiThreatQueue(prev => [
        { id: Date.now(), ...data, timestamp: new Date() },
        ...prev
      ].slice(0, 10));
    });

    // ── Transaction reviewed ──
    socket.on('transaction:reviewed', (data) => {
      const event = {
        id:        Date.now() + Math.random(),
        type:      'reviewed',
        title:     `Transaction ${data.resolution?.replace('_', ' ').toUpperCase()}`,
        subtitle:  `Review completed`,
        riskLevel: 'LOW',
        timestamp: new Date()
      };
      setLiveEvents(prev => [event, ...prev].slice(0, 50));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const clearEvents = useCallback(() => setLiveEvents([]), []);
  const clearAiQueue = useCallback(() => setAiThreatQueue([]), []);
  const emit = useCallback((event, data) => socketRef.current?.emit(event, data), []);

  return {
    connected,
    liveEvents,
    aiThreatQueue,
    liveStats,
    clearEvents,
    clearAiQueue,
    emit,
    socket: socketRef.current
  };
}
