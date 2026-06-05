import { Activity, ArrowUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { getCompassDirection } from "../lib/utils";

export function DeviceCard({ name, speed, direction, isOnline }) {
  return (
    <Card className="border-gray-200 shadow-sm">
      <CardHeader className="pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm text-gray-500">{name}</CardTitle>
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
              isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></div>
              {isOnline ? 'Online' : 'Offline'}
            </div>
          </div>
          <Activity className="w-4 h-4 text-gray-400" />
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-3">
        <div>
          <p className="text-xs text-gray-500">Speed</p>
          <p className="text-2xl font-bold">{speed.toFixed(2)} m/s</p>
        </div>
        <div className="pt-3 border-t border-gray-100 flex justify-between">
          <div>
            <p className="text-xs text-gray-500">Direction</p>
            <p className="text-lg">{direction}° {getCompassDirection(direction)}</p>
          </div>
          <ArrowUp 
            style={{ transform: `rotate(${direction}deg)` }} 
            className="w-5 h-5 text-gray-600 transition-transform" 
          />
        </div>
      </CardContent>
    </Card>
  );
}