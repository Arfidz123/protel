import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { Download, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { HistoryStats } from "../components/HistoryStats";
import { HistoryTable } from "../components/HistoryTable";
import { MapLoading, MapError } from "../components/MapStatus";

const socket = io("http://localhost:5000", { transports: ["websocket"] });

export function History() {
  const [historicalData, setHistoricalData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    fetchHistoricalData();

    socket.on("sensorUpdate", (data) => {
      const timestamp = new Date(data.timestamp);
      const newRow = {
        device1Speed:     parseFloat(data.device1Speed) || 0,
        device1Direction: parseFloat(data.device1Direction) || 0,
        device1Wave:      parseFloat(data.device1WaveIntensity || 0) || 0,
        device2Speed:     parseFloat(data.device2Speed) || 0,
        device2Direction: parseFloat(data.device2Direction) || 0,
        device2Wave:      parseFloat(data.device2WaveIntensity || 0) || 0,
        device3Speed:     parseFloat(data.device3Speed) || 0,
        device3Direction: parseFloat(data.device3Direction) || 0,
        device3Wave:      parseFloat(data.device3WaveIntensity || 0) || 0,
        status:           data.prediction,
        date: timestamp.toLocaleDateString("id-ID", { month: "short", day: "numeric" }),
        time: timestamp.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
        timestamp: data.timestamp,
      };

      setHistoricalData((prev) => {
        if (prev[0]?.timestamp === newRow.timestamp) return prev;
        return [newRow, ...prev].slice(0, 200);
      });
    });

    return () => {
      socket.off("sensorUpdate");
    };
  }, []);

  const fetchHistoricalData = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:5000/api/history?limit=200');
      const result = await response.json();
      
      if (!result.success) throw new Error(result.error || 'Failed');
      
      const transformedData = result.data.map(r => {
        const timestamp = new Date(r.timestamp);
        return {
          device1Speed:     parseFloat(r.device1_speed) || 0,
          device1Direction: parseFloat(r.device1_dir)   || 0,
          device1Wave:      parseFloat(r.device1_wave)  || 0,
          device2Speed:     parseFloat(r.device2_speed) || 0,
          device2Direction: parseFloat(r.device2_dir)   || 0,
          device2Wave:      parseFloat(r.device2_wave)  || 0,
          device3Speed:     parseFloat(r.device3_speed) || 0,
          device3Direction: parseFloat(r.device3_dir)   || 0,
          device3Wave:      parseFloat(r.device3_wave)  || 0,
          status:           r.prediction,
          date: timestamp.toLocaleDateString("id-ID", { month: "short", day: "numeric" }),
          time: timestamp.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
          timestamp: r.timestamp,
        };
      });
      
      setHistoricalData(transformedData);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const headers = ['Date', 'Time', 'D1 Speed', 'D1 Dir', 'D1 Wave', 
                     'D2 Speed', 'D2 Dir', 'D2 Wave', 'D3 Speed', 'D3 Dir', 'D3 Wave', 'Status'];
    const rows = historicalData.map(r => [
      r.date, r.time,
      r.device1Speed.toFixed(2), r.device1Direction, r.device1Wave.toFixed(2),
      r.device2Speed.toFixed(2), r.device2Direction, r.device2Wave.toFixed(2),
      r.device3Speed.toFixed(2), r.device3Direction, r.device3Wave.toFixed(2),
      r.status
    ]);
    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rip-current-history-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleReset = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/history', { method: 'DELETE' });
      const result = await response.json();
      if (result.success) {
        setHistoricalData([]);
        setShowResetConfirm(false);
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  if (loading) return <MapLoading />;
  if (error) return <MapError error={error} onRetry={fetchHistoricalData} />;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Full History</h1>
          <p className="text-sm text-gray-500">3 buoy dengan wave intensity ({historicalData.length} records)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchHistoricalData} className="gap-2">
            <RefreshCw className="w-3 h-3" /> Refresh
          </Button>
          <Button onClick={handleExport} size="sm" className="gap-2">
            <Download className="w-3 h-3" /> Export CSV
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setShowResetConfirm(true)} className="gap-2 bg-red-600 text-white hover:bg-red-700">
            <Trash2 className="w-3 h-3" /> Reset
          </Button>
        </div>
      </div>

      {showResetConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md mx-4">
            <h3 className="text-lg font-bold text-red-600 mb-2">Konfirmasi Reset</h3>
            <p className="text-sm text-gray-600 mb-4">Semua history akan dihapus permanen.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowResetConfirm(false)}>Batal</Button>
              <Button variant="destructive" onClick={handleReset} className="bg-red-600 text-white hover:bg-red-700">Ya, Hapus</Button>
            </div>
          </div>
        </div>
      )}

      <HistoryStats data={historicalData} />
      <HistoryTable data={historicalData} />
    </div>
  );
}
