import { RefreshCw, AlertCircle } from "lucide-react";

export function MapLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-2" />
        <p className="text-sm text-gray-500">Loading map data...</p>
      </div>
    </div>
  );
}

export function MapError({ error, onRetry }) {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
        <p className="text-sm text-red-600 mb-2">{error}</p>
        <button onClick={onRetry} className="text-sm text-blue-600 hover:underline">
          Try again
        </button>
      </div>
    </div>
  );
}