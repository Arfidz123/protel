import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { DeviceCard } from "../components/DeviceCard";
import { PredictionAlert } from "../components/PredictionAlert";

const socket = io("http://localhost:5000", {
  transports: ["websocket"]
});

export function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    socket.on("sensorUpdate", (newData) => {
      setData(newData);
    });

    return () => socket.off("sensorUpdate");
  }, []);

  if (!data) return (
    <div className="p-6 flex items-center justify-center min-h-[50vh]">
      <p className="text-gray-500">Menunggu data dari alat...</p>
    </div>
  );

  // Hitung kecepatan rata-rata dari 3 device untuk display
  const avgSpeed = (data.device1Speed + data.device2Speed + data.device3Speed) / 3;
  
  // Prediction langsung dari ML service (Safe/Danger), bukan hitung lokal
  const prediction = data.prediction || 'Safe';
  const isDanger = prediction === 'Danger';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* 3 Device Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DeviceCard 
          name="Device 1 (Kiri)" 
          speed={data.device1Speed} 
          direction={data.device1Direction} 
          isOnline={true} 
        />
        <DeviceCard 
          name="Device 2 (Tengah)" 
          speed={data.device2Speed} 
          direction={data.device2Direction} 
          isOnline={true} 
        />
        <DeviceCard 
          name="Device 3 (Kanan)" 
          speed={data.device3Speed} 
          direction={data.device3Direction} 
          isOnline={true} 
        />
      </div>
      
      {/* Prediction Alert */}
      <div className="mt-6">
        <PredictionAlert 
          status={prediction} 
          color={isDanger ? "destructive" : "success"} 
          avgSpeed={avgSpeed} 
        />
      </div>
    </div>
  );
}
