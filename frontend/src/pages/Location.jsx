import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Wifi, WifiOff } from "lucide-react";

const socket = io("http://localhost:5000", { transports: ["websocket"] });

// Custom icon - warna sesuai status Safe/Danger
function createBuoyIcon(status, nodeId) {
  const color = status === "Danger" ? "#dc2626" : "#16a34a";
  const html = `
    <div style="
      background-color: ${color};
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 14px;
    ">B${nodeId}</div>
  `;
  return L.divIcon({
    html,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    className: 'custom-buoy-marker',
  });
}

// Auto-center map saat posisi buoy berubah
function MapCenterController({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] !== 0 && center[1] !== 0) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  return null;
}

// Panah arah arus dari posisi buoy
function ArrowFromBuoy({ position, direction, speed }) {
  if (!position || position[0] === 0 || speed < 0.05) return null;
  
  const lengthMeters = Math.min(speed * 80, 80);
  const lat = position[0];
  const lon = position[1];
  const dirRad = (direction * Math.PI) / 180;
  
  const dLatMeters = lengthMeters * Math.cos(dirRad);
  const dLonMeters = lengthMeters * Math.sin(dirRad);
  const dLat = dLatMeters / 111000;
  const dLon = dLonMeters / (111000 * Math.cos(lat * Math.PI / 180));
  
  const endPoint = [lat + dLat, lon + dLon];
  
  return (
    <Polyline 
      positions={[position, endPoint]} 
      color={speed > 0.5 ? "#dc2626" : "#3b82f6"}
      weight={3}
      opacity={0.7}
    />
  );
}

export function Location() {
  const [data, setData] = useState(null);
  const [systemStatus, setSystemStatus] = useState({ online: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch data terakhir dari API saat load (untuk persist saat hardware off)
    fetch('http://localhost:5000/api/latest')
      .then(r => r.json())
      .then(result => {
        if (result.data) {
          const apiData = {
            device1Speed:         parseFloat(result.data.device1_speed) || 0,
            device1Direction:     parseFloat(result.data.device1_dir)   || 0,
            device1WaveIntensity: parseFloat(result.data.device1_wave)  || 0,
            device1Lat:           parseFloat(result.data.device1_lat)   || 0,
            device1Lon:           parseFloat(result.data.device1_lon)   || 0,
            device2Speed:         parseFloat(result.data.device2_speed) || 0,
            device2Direction:     parseFloat(result.data.device2_dir)   || 0,
            device2WaveIntensity: parseFloat(result.data.device2_wave)  || 0,
            device2Lat:           parseFloat(result.data.device2_lat)   || 0,
            device2Lon:           parseFloat(result.data.device2_lon)   || 0,
            device3Speed:         parseFloat(result.data.device3_speed) || 0,
            device3Direction:     parseFloat(result.data.device3_dir)   || 0,
            device3WaveIntensity: parseFloat(result.data.device3_wave)  || 0,
            device3Lat:           parseFloat(result.data.device3_lat)   || 0,
            device3Lon:           parseFloat(result.data.device3_lon)   || 0,
            prediction:           result.data.prediction || 'Safe',
          };
          setData(apiData);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Fetch latest error:', err);
        setLoading(false);
      });
    
    // Subscribe socket untuk real-time updates
    socket.on("sensorUpdate", setData);
    socket.on("systemStatus", setSystemStatus);
    
    return () => {
      socket.off("sensorUpdate");
      socket.off("systemStatus");
    };
  }, []);

  // Default center: Surabaya
  const defaultCenter = [-7.289, 112.798];
  
  // Hitung center berdasarkan rata-rata posisi 3 buoy
  let mapCenter = defaultCenter;
  if (data && data.device1Lat && data.device1Lat !== 0) {
    const lats = [data.device1Lat, data.device2Lat, data.device3Lat].filter(l => l && l !== 0);
    const lons = [data.device1Lon, data.device2Lon, data.device3Lon].filter(l => l && l !== 0);
    if (lats.length > 0) {
      mapCenter = [
        lats.reduce((s, v) => s + v, 0) / lats.length,
        lons.reduce((s, v) => s + v, 0) / lons.length,
      ];
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center py-12 text-gray-500">Memuat peta...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Status Bar */}
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
            {systemStatus.online ? "Hardware Online (3 buoy aktif)" : "Hardware Offline - Menampilkan data terakhir"}
          </span>
        </div>
        {data && data.prediction && (
          <span className={`text-xs px-3 py-1 rounded-full font-bold ${
            data.prediction === 'Danger' 
              ? 'bg-red-100 text-red-700' 
              : 'bg-green-100 text-green-700'
          }`}>
            {data.prediction === 'Danger' ? 'BAHAYA' : 'AMAN'}
          </span>
        )}
      </div>

      {/* Info Card */}
      <Card className="mb-4 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Peta Lokasi Buoy</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-gray-600 space-y-1">
          <p>• Marker <span className="text-green-700 font-semibold">hijau</span> = Aman, <span className="text-red-700 font-semibold">merah</span> = Bahaya (sesuai prediksi ML)</p>
          <p>• Garis biru/merah = arah arus + intensitas kecepatan (panjang sesuai speed)</p>
          <p>• Klik marker untuk detail tiap buoy</p>
          <p>• Map tetap menampilkan posisi terakhir walaupun hardware offline</p>
        </CardContent>
      </Card>

      {/* Map */}
      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-0" style={{ height: '600px' }}>
          <MapContainer 
            center={mapCenter} 
            zoom={17} 
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            <MapCenterController center={mapCenter} />
            
            {/* Tampilkan marker + arrow tiap buoy */}
            {data && [1, 2, 3].map(nodeId => {
              const lat = data[`device${nodeId}Lat`];
              const lon = data[`device${nodeId}Lon`];
              const speed = data[`device${nodeId}Speed`];
              const dir = data[`device${nodeId}Direction`];
              const wave = data[`device${nodeId}WaveIntensity`];
              const status = data.prediction || 'Safe';
              
              if (!lat || !lon || lat === 0 || lon === 0) return null;
              
              const buoyLabel = nodeId === 1 ? 'Buoy 1 (Kiri)' 
                              : nodeId === 2 ? 'Buoy 2 (Tengah)' 
                              : 'Buoy 3 (Kanan)';
              
              return (
                <div key={nodeId}>
                  <Marker 
                    position={[lat, lon]} 
                    icon={createBuoyIcon(status, nodeId)}
                  >
                    <Popup>
                      <div className="text-sm" style={{ minWidth: '180px' }}>
                        <p className="font-bold mb-2 text-base">{buoyLabel}</p>
                        <div className="space-y-1">
                          <p>Kecepatan: <span className="font-semibold">{speed?.toFixed(2)} m/s</span></p>
                          <p>Arah: <span className="font-semibold">{Math.round(dir)}°</span></p>
                          <p>Gelombang: <span className="font-semibold">{wave?.toFixed(2)} 
                            <span className={`ml-1 text-xs px-1 rounded ${
                              wave < 1.0 ? 'bg-green-100 text-green-700' :
                              wave < 3.0 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {wave < 1.0 ? 'CALM' : wave < 3.0 ? 'MODERATE' : 'ROUGH'}
                            </span>
                          </span></p>
                          <p className="text-xs mt-2 text-gray-500 border-t pt-1">
                            {lat.toFixed(6)}, {lon.toFixed(6)}
                          </p>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                  <ArrowFromBuoy 
                    position={[lat, lon]} 
                    direction={dir}
                    speed={speed}
                  />
                </div>
              );
            })}
          </MapContainer>
        </CardContent>
      </Card>
      
      {/* Statistik Singkat Per Buoy */}
      {data && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(nodeId => {
            const lat = data[`device${nodeId}Lat`];
            const lon = data[`device${nodeId}Lon`];
            const speed = data[`device${nodeId}Speed`];
            const dir = data[`device${nodeId}Direction`];
            const wave = data[`device${nodeId}WaveIntensity`];
            const hasGps = lat && lat !== 0;
            const buoyLabel = nodeId === 1 ? 'Buoy 1 (Kiri)' 
                            : nodeId === 2 ? 'Buoy 2 (Tengah)' 
                            : 'Buoy 3 (Kanan)';
            
            return (
              <Card key={nodeId} className="shadow-sm">
                <CardContent className="p-3 text-xs space-y-1">
                  <p className="font-bold text-sm">{buoyLabel}</p>
                  <p>v={speed?.toFixed(2)} m/s, arah={Math.round(dir)}°</p>
                  <p>wave={wave?.toFixed(2)}</p>
                  {hasGps ? (
                    <p className="text-gray-500 text-xs">
                      {lat.toFixed(4)}, {lon.toFixed(4)}
                    </p>
                  ) : (
                    <p className="text-yellow-600 text-xs">GPS belum fix</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      
      {!data && (
        <Card className="mt-4 shadow-sm">
          <CardContent className="p-6 text-center text-gray-500">
            <p>Belum ada data dari hardware.</p>
            <p className="text-xs mt-2">Nyalakan buoy untuk menampilkan posisi.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
