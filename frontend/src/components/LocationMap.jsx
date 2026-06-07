import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'

// Fix default marker icon broken in Vite/webpack builds
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Helper: smoothly pan map when position changes
function MapUpdater({ position }) {
  const map = useMap()
  useEffect(() => {
    if (position) map.panTo(position)
  }, [position, map])
  return null
}

export default function LocationMap({ sensorData }) {
  const defaultPosition = [-7.2575, 112.7521] // fallback sebelum data masuk

  const position = sensorData?.latitude && sensorData?.longitude
    ? [sensorData.latitude, sensorData.longitude]
    : null

  return (
    <MapContainer
      center={position || defaultPosition}
      zoom={16}
      style={{ height: '100%', width: '100%', borderRadius: '8px' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {position && (
        <>
          <MapUpdater position={position} />
          <Marker position={position}>
            <Popup>
              <div>
                <strong>Sensor Location</strong><br />
                Lat: {sensorData.latitude.toFixed(6)}<br />
                Lng: {sensorData.longitude.toFixed(6)}<br />
                Speed D1: {sensorData.device1Speed} m/s<br />
                Status: <strong style={{ color: sensorData.prediction === 'Danger' ? 'red' : 'green' }}>
                  {sensorData.prediction}
                </strong>
              </div>
            </Popup>
          </Marker>
        </>
      )}
    </MapContainer>
  )
}