import { Map as MapIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

export function MapViewer({ locations, formatCoordinates }) {
  return (
    <Card className="lg:col-span-2 border-gray-200 shadow-sm">
      <CardHeader className="pb-3 border-b border-gray-100">
        <CardTitle className="text-sm text-gray-500">Device Locations</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="aspect-video bg-gray-50 rounded border border-gray-200 flex items-center justify-center">
          <div className="text-center">
            <MapIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 font-medium">Map Visualization</p>
            <div className="mt-3 space-y-1">
              {locations.map((loc) => (
                <p key={loc.deviceId} className="text-xs text-gray-600">
                  {loc.name}: {formatCoordinates(loc.latitude, loc.longitude)}
                </p>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}