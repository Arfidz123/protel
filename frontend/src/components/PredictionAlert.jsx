import { AlertCircle, ShieldCheck, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";

export function PredictionAlert({ status, color, avgSpeed }) {
  const isDanger = status === "Danger";
  
  return (
    <Card className={`mb-6 shadow-sm ${
      isDanger 
        ? "border-red-500 bg-red-50" 
        : "border-green-500 bg-green-50"
    }`}>
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isDanger ? (
            <ShieldAlert className="w-6 h-6 text-red-600" />
          ) : (
            <ShieldCheck className="w-6 h-6 text-green-600" />
          )}
          <div>
            <p className="text-xs text-gray-600">Prediction Status</p>
            <span className={`text-xl font-bold ${
              isDanger ? "text-red-700" : "text-green-700"
            }`}>
              {status === "Danger" ? "BAHAYA - Potensi Rip Current" : "AMAN"}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={isDanger ? "destructive" : "default"}>
            {avgSpeed.toFixed(2)} m/s
          </Badge>
          <p className="text-xs text-gray-500">Avg speed (3 buoy)</p>
        </div>
      </CardContent>
    </Card>
  );
}
