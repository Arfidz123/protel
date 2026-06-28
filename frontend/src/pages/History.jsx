import { useState, useEffect } from "react";
import { Download, RefreshCw, Trash2, AlertCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import { HistoryStats } from "../components/HistoryStats";
import { HistoryTable } from "../components/HistoryTable";

export function History() {
  const [historicalData, setHistoricalData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => { fetchHistoricalData(); }, []);

  const fetchHistoricalData = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:5000/api/history?limit=200');
      const result = await response.json();
      
      if (!result.success) throw new Error(result.error || 'Failed to fetch');
      
      const transformed = result.data.map(r => {
        const ts = new Date(r.timestamp);
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
          date: ts.toLocaleDateString("id-ID", { month: "short", day: "numeric" }),
          time: ts.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
          timestamp: r.timestamp,
        };
      });
      
      setHistoricalData(transformed);
      setError(null);
    } catch (err) {
      console.error('Error fetch history:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (historicalData.length === 0) return;
    
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

  // LOADING STATE 
  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 text-gray-400 mx-auto mb-3 animate-spin" />
          <p className="text-gray-500">Memuat data history...</p>
        </div>
      </div>
    );
  }

  // ERROR STATE (backend mati / database error) 
  if (error) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Full History</h1>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
          <p className="text-red-700 font-medium mb-1">Gagal memuat data</p>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <p className="text-xs text-gray-600 mb-3">
            Pastikan backend (port 5000) berjalan dan database terhubung.
          </p>
          <Button onClick={fetchHistoricalData} variant="outline" size="sm">
            <RefreshCw className="w-3 h-3 mr-2" /> Coba Lagi
          </Button>
        </div>
      </div>
    );
  }

  // EMPTY STATE (hardware belum pernah nyala, database kosong) 
  if (historicalData.length === 0) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Full History</h1>
            <p className="text-sm text-gray-500">Data historis dari 3 buoy</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchHistoricalData}>
            <RefreshCw className="w-3 h-3 mr-2" /> Refresh
          </Button>
        </div>
        
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-gray-700 font-medium mb-2">Belum ada data history</p>
          <p className="text-sm text-gray-500 mb-1">
            Database kosong. Data akan muncul saat:
          </p>
          <ul className="text-sm text-gray-500 list-disc list-inside mt-2">
            <li>Hardware nyala dan kirim data</li>
          </ul>
        </div>
      </div>
    );
  }

  // NORMAL STATE 
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Full History</h1>
          <p className="text-sm text-gray-500">
            Data historis dari 3 buoy ({historicalData.length} records)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchHistoricalData} className="gap-2">
            <RefreshCw className="w-3 h-3" /> Refresh
          </Button>
          <Button onClick={handleExport} size="sm" className="gap-2">
            <Download className="w-3 h-3" /> Export CSV
          </Button>
          <Button 
            variant="destructive" 
            size="sm" 
            onClick={() => setShowResetConfirm(true)} 
            className="gap-2"
          >
            <Trash2 className="w-3 h-3" /> Reset
          </Button>
        </div>
      </div>

      {showResetConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-bold text-red-600 mb-2">Konfirmasi Reset</h3>
            <p className="text-sm text-gray-600 mb-4">
              Semua history akan dihapus permanen. Tindakan ini tidak bisa di-undo.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowResetConfirm(false)}>Batal</Button>
              <Button variant="destructive" onClick={handleReset}>Ya, Hapus Semua</Button>
            </div>
          </div>
        </div>
      )}

      <HistoryStats data={historicalData} />
      <HistoryTable data={historicalData} />
    </div>
  );
}
