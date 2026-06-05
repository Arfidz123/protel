import { useState, useEffect } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/button";
import { HistoryStats } from "../components/HistoryStats";
import { HistoryTable } from "../components/HistoryTable";
import { MapLoading, MapError } from "../components/MapStatus";

export function History() {
  const [historicalData, setHistoricalData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { 
    fetchHistoricalData(); 
  }, []);

  const fetchHistoricalData = async () => {
    try {
      setLoading(true);
      
      // Fetch dari backend Bintang
      const response = await fetch('http://localhost:5000/api/history?limit=200');
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch');
      }
      
      // Transform data dari format backend (snake_case) ke frontend (camelCase)
      const transformedData = result.data.map(reading => {
        const timestamp = new Date(reading.timestamp);
        return {
          device1Speed:     parseFloat(reading.device1_speed) || 0,
          device1Direction: parseFloat(reading.device1_dir)   || 0,
          device2Speed:     parseFloat(reading.device2_speed) || 0,
          device2Direction: parseFloat(reading.device2_dir)   || 0,
          device3Speed:     parseFloat(reading.device3_speed) || 0,
          device3Direction: parseFloat(reading.device3_dir)   || 0,
          status:           reading.prediction,  // "Safe" atau "Danger" dari ML
          date: timestamp.toLocaleDateString("id-ID", { month: "short", day: "numeric" }),
          time: timestamp.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
          timestamp: reading.timestamp,
        };
      });
      
      setHistoricalData(transformedData);
      setError(null);
    } catch (err) {
      console.error('Error fetch history:', err);
      setError(err.message || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const headers = ['Date', 'Time', 'D1 Speed', 'D1 Dir', 'D2 Speed', 'D2 Dir', 'D3 Speed', 'D3 Dir', 'Status'];
    const rows = historicalData.map(r => [
      r.date, r.time,
      r.device1Speed.toFixed(2), r.device1Direction,
      r.device2Speed.toFixed(2), r.device2Direction,
      r.device3Speed.toFixed(2), r.device3Direction,
      r.status
    ]);
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rip-current-history-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (loading) return <MapLoading />;
  if (error) return <MapError error={error} onRetry={fetchHistoricalData} />;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Full History</h1>
          <p className="text-sm text-gray-500">Data historis dari 3 buoy</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchHistoricalData} className="gap-2">
            <RefreshCw className="w-3 h-3" /> Refresh
          </Button>
          <Button onClick={handleExport} size="sm" className="gap-2">
            <Download className="w-3 h-3" /> Export CSV
          </Button>
        </div>
      </div>

      <HistoryStats data={historicalData} />
      <HistoryTable data={historicalData} />
    </div>
  );
}
