import { useState, useEffect } from "react";
import { apiService } from "../services/api.service";
import { MapViewer } from "../components/MapViewer";
import { LocationCard } from "../components/LocationCard";
import { MapLoading, MapError } from "../components/MapStatus";
import { MOCK_LOCATIONS } from "../data/Mock";

export function Location() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { fetchMapLocations(); }, []);

//   const fetchMapLocations = async () => {
//     try {
//       setLoading(true);
//       const response = await apiService.getMapLocations();
//       if (response.success) {
//         setLocations(response.data);
//         setError(null);
//       } else {
//         setError(response.error || 'Failed to fetch map locations');
//       }
//     } catch (err) {
//       setError('An unexpected error occurred');
//     } finally {
//       setLoading(false);
//     }
//   };

  const formatCoordinates = (lat, lng) => {
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lng).toFixed(4)}°${lngDir}`;
  };

const fetchMapLocations = async () => {
  try {
    setLoading(true);
    
    const useMock = true; 

    if (useMock) {
      await new Promise(resolve => setTimeout(resolve, 600)); 
      setLocations(MOCK_LOCATIONS);
      setError(null);
    } else {
      const response = await apiService.getMapLocations();
      if (response.success && response.data) {
        setLocations(response.data);
        setError(null);
      } else {
        setError(response.error || 'Failed to fetch map locations');
      }
    }
  } catch (err) {
    setError('An unexpected error occurred');
    console.error('Error fetching locations:', err);
  } finally {
    setLoading(false);
  }
};

  if (loading) return <MapLoading />;
  if (error) return <MapError error={error} onRetry={fetchMapLocations} />;

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