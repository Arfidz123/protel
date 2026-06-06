import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

// Fix broken default marker icons in Vite builds
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Separate marker icons for online vs offline devices
const onlineIcon = new L.Icon({
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize:    [25, 41],
  iconAnchor:  [12, 41],
  popupAnchor: [1, -34],
});

const offlineIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-grey.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize:    [25, 41],
  iconAnchor:  [12, 41],
  popupAnchor: [1, -34],
});

// Pan map smoothly when center changes
function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.panTo(center);
  }, [center, map]);
  return null;
}

export function MapViewer({ locations, formatCoordinates }) {
  // Center map on first online device, or average of all
  const onlineDevices = locations.filter(l => l.status === "online");
  const centerDevice  = onlineDevices[0] || locations[0];
  const center = centerDevice
    ? [centerDevice.latitude, centerDevice.longitude]
    : [-8.0254, 110.3288]; // fallback: Parangtritis

  return (
    <Card className="lg:col-span-2 border-gray-200 shadow-sm">
      <CardHeader className="pb-3 border-b border-gray-100">
        <CardTitle className="text-sm text-gray-500">Device Locations</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="aspect-video rounded border border-gray-200 overflow-hidden">
          <MapContainer
            center={center}
            zoom={14}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapUpdater center={center} />

            {locations.map((loc) => (
              <Marker
                key={loc.deviceId}
                position={[loc.latitude, loc.longitude]}
                icon={loc.status === "online" ? onlineIcon : offlineIcon}
              >
                <Popup>
                  <div className="text-xs space-y-1">
                    <p className="font-semibold text-gray-800">{loc.name}</p>
                    <p className="text-gray-500">
                      {formatCoordinates(loc.latitude, loc.longitude)}
                    </p>
                    <p>
                      Status:{" "}
                      <span style={{ color: loc.status === "online" ? "green" : "gray" }}>
                        {loc.status === "online" ? "● Online" : "● Offline"}
                      </span>
                    </p>
                    {loc.lastUpdate && (
                      <p className="text-gray-400">
                        Updated: {new Date(loc.lastUpdate).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </CardContent>
    </Card>
  );
}
