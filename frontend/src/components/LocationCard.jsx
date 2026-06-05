import { MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

export function LocationCard({ location, formatCoordinates }) {
  return (
    <Card className="border-gray-200 shadow-sm">
      <CardHeader className="pb-3 border-b border-gray-100">
        <CardTitle className="text-sm text-gray-500">
          {location.deviceId === 'device1' ? 'Device 1' : 'Device 2'}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
          <div>
            <p className="text-xs text-gray-500">Location</p>
            <p className="text-sm text-gray-900">{location.name}</p>
          </div>
        </div>
        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-0.5">Coordinates</p>
          <p className="text-sm text-gray-700 tabular-nums">
            {formatCoordinates(location.latitude, location.longitude)}
          </p>
        </div>
        {/* Info detail bisa diringkas atau tetap ditampilkan sesuai kebutuhan */}
      </CardContent>
    </Card>
  );
}