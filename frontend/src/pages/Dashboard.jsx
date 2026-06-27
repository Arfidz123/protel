import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { Wifi, WifiOff, Waves, Navigation, Activity, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { PredictionAlert } from "../components/PredictionAlert";

const socket = io("http://localhost:5000", { transports: ["websocket"] });

// Status badge per buoy
function StatusBadge({ status }) {
  const config = {
    ONLINE: { color: 'bg-green-500', text: 'Online', textColor: 'text-green-700' },
    STALE:  { color: 'bg-yellow-500', text: 'Data Lama', textColor: 'text-yellow-700' },
    OFFLINE: { color: 'bg-red-500', text: 'Offline', textColor: 'text-red-700' },
    NEVER_SEEN: { color: 'bg-gray-400', text: 'Belum Aktif', textColor: 'text-gray-600' },
  };
  const c = config[status] || config.NEVER_SEEN;
  
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${c.color} ${status === 'ONLINE' ? 'animate-pulse' : ''}`}></span>
      <span className={`text-xs font-medium ${c.textColor}`}>{c.text}</span>
    </div>
  );
}

function WaveBadge({ intensity }) {
  let category, color;
  if (intensity < 1.0) {
    category = "CALM";
    color = "bg-green-100 text-green-700 border-green-300";
  } else if (intensity < 3.0) {
    category = "MODERATE";
    color = "bg-yellow-100 text-yellow-700 border-yellow-300";
  } else {
    category = "ROUGH";
    color = "bg-red-100 text-red-700 border-red-300";
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-semibold ${color}`}>
      {category}
    </span>
  );
}

function DeviceCardEnhanced({ name, speed, direction, waveIntensity, status }) {
  // Visual treatment berdasarkan status
  const isLive = status === 'ONLINE';
  const isStale = status === 'STALE';
  const isOffline = status === 'OFFLINE' || status === 'NEVER_SEEN';
  
  return (
    <Card className={`shadow-sm transition-opacity ${
      isLive ? 'border-green-200' : 
      isStale ? 'border-yellow-200 opacity-90' : 
      'border-gray-300 opacity-70'
    }`}>
      <CardHeader className="pb-2 border-b border-gray-100">
        <CardTitle className="flex items-center justify-between text-sm">
          <span>{name}</span>
          <StatusBadge status={status} />
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-3 space-y-3">
        {status === 'NEVER_SEEN' ? (
          <div className="py-6 text-center text-gray-400 text-xs">
            <AlertCircle className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p>Buoy belum pernah terhubung</p>
          </div>
        ) : (
          <>
            {isStale && (
              <div className="px-2 py-1 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
                Menampilkan data terakhir (buoy tidak update &gt; 10 detik)
              </div>
            )}
            
            {/* Kecepatan Arus */}
            <div className="flex items-center gap-3">
              <Activity className="w-4 h-4 text-blue-500" />
              <div className="flex-1">
                <p className="text-xs text-gray-500">Kecepatan Arus</p>
                <p className="text-xl font-bold tabular-nums">
                  {(speed || 0).toFixed(2)} <span className="text-sm font-normal text-gray-500">m/s</span>
                </p>
              </div>
            </div>
            
            {/* Arah Arus */}
            <div className="flex items-center gap-3">
              <Navigation 
                className="w-4 h-4 text-purple-500" 
                style={{ transform: `rotate(${direction || 0}deg)` }} 
              />
              <div className="flex-1">
                <p className="text-xs text-gray-500">Arah Arus</p>
                <p className="text-xl font-bold tabular-nums">
                  {Math.round(direction || 0)}<span className="text-sm font-normal text-gray-500">°</span>
                </p>
              </div>
            </div>
            
            {/* Wave Intensity */}
            <div className="flex items-center gap-3">
              <Waves className="w-4 h-4 text-cyan-500" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">Tingkat Gelombang</p>
                  <WaveBadge intensity={waveIntensity || 0} />
                </div>
                <p className="text-xl font-bold tabular-nums">
                  {(waveIntensity || 0).toFixed(2)} <span className="text-sm font-normal text-gray-500">score</span>
                </p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function Dashboard() {
  const [data, setData] = useState(null);
  const [buoyStatus, setBuoyStatus] = useState({
    buoy1: 'NEVER_SEEN',
    buoy2: 'NEVER_SEEN',
    buoy3: 'NEVER_SEEN',
    anyOnline: false,
    allOnline: false,
  });

  useEffect(() => {
    socket.on("sensorUpdate", setData);
    socket.on("buoyStatus", setBuoyStatus);
    
    return () => {
      socket.off("sensorUpdate");
      socket.off("buoyStatus");
    };
  }, []);

  // System status global
  const onlineCount = [buoyStatus.buoy1, buoyStatus.buoy2, buoyStatus.buoy3].filter(s => s === 'ONLINE').length;
  const isSystemActive = onlineCount > 0;
  
  // Cek apakah ada buoy yang STALE (data lama)
  const hasStale = [buoyStatus.buoy1, buoyStatus.buoy2, buoyStatus.buoy3].some(s => s === 'STALE');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Status Bar */}
      <div className={`mb-4 px-4 py-2 rounded-lg border flex items-center justify-between ${
        isSystemActive ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"
      }`}>
        <div className="flex items-center gap-2">
          {isSystemActive ? (
            <Wifi className="w-4 h-4 text-green-600" />
          ) : (
            <WifiOff className="w-4 h-4 text-yellow-600" />
          )}
          <span className={`text-sm font-medium ${
            isSystemActive ? "text-green-700" : "text-yellow-700"
          }`}>
            {isSystemActive 
              ? `Sistem Aktif (${onlineCount}/3 buoy online${hasStale ? ', sebagian data lama' : ''})` 
              : "Menunggu Hardware..."}
          </span>
        </div>
      </div>

      {!data ? (
        <div className="p-12 text-center">
          <p className="text-gray-500">Belum ada data dari hardware</p>
          <p className="text-xs text-gray-400 mt-2">Nyalakan minimal 1 buoy untuk mulai monitoring</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <DeviceCardEnhanced 
              name="Buoy 1 (Kiri)" 
              speed={data.device1Speed} 
              direction={data.device1Direction} 
              waveIntensity={data.device1WaveIntensity}
              status={data.device1Status || buoyStatus.buoy1}
            />
            <DeviceCardEnhanced 
              name="Buoy 2 (Tengah)" 
              speed={data.device2Speed} 
              direction={data.device2Direction} 
              waveIntensity={data.device2WaveIntensity}
              status={data.device2Status || buoyStatus.buoy2}
            />
            <DeviceCardEnhanced 
              name="Buoy 3 (Kanan)" 
              speed={data.device3Speed} 
              direction={data.device3Direction} 
              waveIntensity={data.device3WaveIntensity}
              status={data.device3Status || buoyStatus.buoy3}
            />
          </div>
          
          {/* Prediction Alert */}
          <div className="mt-6">
            <PredictionAlert 
              status={data.prediction || 'Safe'} 
              color={data.prediction === 'Danger' ? "destructive" : "success"} 
              avgSpeed={(data.device1Speed + data.device2Speed + data.device3Speed) / 3}
            />
            
            {/* Warning kalau ada buoy yang offline/stale */}
            {(hasStale || onlineCount < 3) && data.prediction && (
              <div className="mt-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                <strong>Catatan:</strong> Prediksi berdasarkan {onlineCount} buoy aktif. 
                {onlineCount < 3 && ' Untuk akurasi maksimal, pastikan semua 3 buoy menyala.'}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
