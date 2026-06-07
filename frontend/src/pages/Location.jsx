import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { MapViewer } from "../components/MapViewer";
import { LocationCard } from "../components/LocationCard";
import { MapLoading, MapError } from "../components/MapStatus";
import { MOCK_LOCATIONS } from "../data/Mock";

const socket = io("http://localhost:5000");

const USE_LIVE_GPS = true; // false = pakai MOCK_LOCATIONS

export function Location() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const formatCoordinates = (lat, lng) => {
    const latDir = lat >= 0 ? "N" : "S";
    const lngDir = lng >= 0 ? "E" : "W";
    return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lng).toFixed(4)}°${lngDir}`;
  };

  // Build locations array from a GPS data point received via socket/API
  // Keeps the same shape as MOCK_LOCATIONS so MapViewer & LocationCard need no changes
  const buildLocationsFromGPS = (data) => {
    return [
      {
        deviceId:   "device1",
        name:       "Buoy Device 1",
        latitude:   data.latitude,
        longitude:  data.longitude,
        status:     "online",
        lastUpdate: data.timestamp || new Date().toISOString(),
      },
      // Tambahkan device2, device3 di sini ketika hardware mengirim GPS masing-masing
      // {
      //   deviceId:  "device2",
      //   name:      "Buoy Device 2",
      //   latitude:  data.device2Latitude,
      //   longitude: data.device2Longitude,
      //   status:    "online",
      //   lastUpdate: data.timestamp,
      // },
    ];
  };

  useEffect(() => {
    if (!USE_LIVE_GPS) {
      // ── MOCK mode ──────────────────────────────────
      setTimeout(() => {
        setLocations(MOCK_LOCATIONS);
        setLoading(false);
      }, 600);
      return;
    }

    // ── LIVE GPS mode ──────────────────────────────
    // 1. Fetch last known position on page load
    fetch("http://localhost:5000/api/location")
      .then((r) => r.json())
      .then((res) => {
        if (res.data?.latitude && res.data?.longitude) {
          setLocations(buildLocationsFromGPS(res.data));
        } else {
          // No GPS yet — show mock as placeholder
          setLocations(MOCK_LOCATIONS);
        }
        setError(null);
      })
      .catch(() => {
        setLocations(MOCK_LOCATIONS); // fallback
        setError(null);
      })
      .finally(() => setLoading(false));

    // 2. Live updates via Socket.IO
    socket.on("sensorUpdate", (data) => {
      if (data.latitude && data.longitude) {
        setLocations(buildLocationsFromGPS(data));
      }
    });

    return () => socket.off("sensorUpdate");
  }, []);

  if (loading) return <MapLoading />;
  if (error)   return <MapError error={error} onRetry={() => window.location.reload()} />;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Maps</h1>
        <p className="text-sm text-gray-500">View device locations and current conditions</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <MapViewer locations={locations} formatCoordinates={formatCoordinates} />

        <div className="space-y-4">
          {locations.map((loc) => (
            <LocationCard
              key={loc.deviceId}
              location={loc}
              formatCoordinates={formatCoordinates}
            />
          ))}
        </div>
      </div>
    </div>
  );
}