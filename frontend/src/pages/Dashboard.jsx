import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { Wifi, WifiOff, Waves, Navigation, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { PredictionAlert } from "../components/PredictionAlert";

const socket = io("http://localhost:5000", { transports: ["websocket"] });

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

function DeviceCardEnhanced({ name, speed, direction, waveIntensity, isOnline }) {
  return (
    <Card className={`shadow-sm ${isOnline ? "border-gray-200" : "border-gray-300 opacity-60"}`}>
      <CardHeader className="pb-2 border-b border-gray-100">
        <CardTitle className="flex items-center justify-between text-sm">
          <span>{name}</span>
          <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-green-500" : "bg-gray-400"}`}></span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-3 space-y-3">
        <div className="flex items-center gap-3">
          <Activity className="w-4 h-4 text-blue-500" />
          <div className="flex-1">
            <p className="text-xs text-gray-500">Kecepatan Arus</p>
            <p className="text-xl font-bold tabular-nums">
              {(speed || 0).toFixed(2)} <span className="text-sm font-normal text-gray-500">m/s</span>
            </p>
          </div>
        </div>
        
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
      </CardContent>
    </Card>
  );
}

export function Dashboard() {
  const [data, setData] = useState(null);
  const [systemStatus, setSystemStatus] = useState({ online: false, message: "Menunggu..." });

  useEffect(() => {
    socket.on("sensorUpdate", setData);
    socket.on("systemStatus", setSystemStatus);
    return () => {
      socket.off("sensorUpdate");
      socket.off("systemStatus");
    };
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className={`mb-4 px-4 py-2 rounded-lg border flex items-center justify-between ${
        systemStatus.online ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"
      }`}>
        <div className="flex items-center gap-2">
          {systemStatus.online ? (
            <Wifi className="w-4 h-4 text-green-600" />
          ) : (
            <WifiOff className="w-4 h-4 text-yellow-600" />
          )}
          <span className={`text-sm font-medium ${
            systemStatus.online ? "text-green-700" : "text-yellow-700"
          }`}>
            {systemStatus.online ? "Sistem Online (3 buoy aktif)" : "Menunggu Hardware..."}
          </span>
        </div>
      </div>

      {!data ? (
        <div className="p-12 text-center">
          <p className="text-gray-500">Belum ada data dari hardware</p>
          <p className="text-xs text-gray-400 mt-2">Nyalakan 3 buoy dan gateway</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <DeviceCardEnhanced 
              name="Buoy 1 (Kiri)" 
              speed={data.device1Speed} 
              direction={data.device1Direction} 
              waveIntensity={data.device1WaveIntensity}
              isOnline={systemStatus.online}
            />
            <DeviceCardEnhanced 
              name="Buoy 2 (Tengah)" 
              speed={data.device2Speed} 
              direction={data.device2Direction} 
              waveIntensity={data.device2WaveIntensity}
              isOnline={systemStatus.online}
            />
            <DeviceCardEnhanced 
              name="Buoy 3 (Kanan)" 
              speed={data.device3Speed} 
              direction={data.device3Direction} 
              waveIntensity={data.device3WaveIntensity}
              isOnline={systemStatus.online}
            />
          </div>
          
          <div className="mt-6">
            <PredictionAlert 
              status={data.prediction || 'Safe'} 
              color={data.prediction === 'Danger' ? "destructive" : "success"} 
              avgSpeed={(data.device1Speed + data.device2Speed + data.device3Speed) / 3}
            />
          </div>
        </>
      )}
    </div>
  );
}
