import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

export function HistoryTable({ data }) {
  return (
    <Card className="border-gray-200 shadow-sm">
      <CardHeader className="pb-3 border-b border-gray-100">
        <CardTitle className="text-sm text-gray-500">Historical Readings (3 Buoys)</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[600px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
              <TableRow className="border-gray-100">
                <TableHead className="text-xs text-gray-500">Date</TableHead>
                <TableHead className="text-xs text-gray-500">Time</TableHead>
                <TableHead className="text-xs text-gray-500 text-right">D1 Spd</TableHead>
                <TableHead className="text-xs text-gray-500 text-right">D1 Dir</TableHead>
                <TableHead className="text-xs text-gray-500 text-right">D2 Spd</TableHead>
                <TableHead className="text-xs text-gray-500 text-right">D2 Dir</TableHead>
                <TableHead className="text-xs text-gray-500 text-right">D3 Spd</TableHead>
                <TableHead className="text-xs text-gray-500 text-right">D3 Dir</TableHead>
                <TableHead className="text-xs text-gray-500 text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((reading, index) => (
                <TableRow key={index} className="border-gray-100 hover:bg-gray-50 transition-colors">
                  <TableCell className="text-sm text-gray-900">{reading.date}</TableCell>
                  <TableCell className="text-sm text-gray-600 tabular-nums">{reading.time}</TableCell>
                  <TableCell className="text-sm text-gray-600 text-right tabular-nums">{reading.device1Speed.toFixed(2)}</TableCell>
                  <TableCell className="text-sm text-gray-600 text-right tabular-nums">{Math.round(reading.device1Direction)}°</TableCell>
                  <TableCell className="text-sm text-gray-600 text-right tabular-nums">{reading.device2Speed.toFixed(2)}</TableCell>
                  <TableCell className="text-sm text-gray-600 text-right tabular-nums">{Math.round(reading.device2Direction)}°</TableCell>
                  <TableCell className="text-sm text-gray-600 text-right tabular-nums">{reading.device3Speed.toFixed(2)}</TableCell>
                  <TableCell className="text-sm text-gray-600 text-right tabular-nums">{Math.round(reading.device3Direction)}°</TableCell>
                  <TableCell className="text-center">
                    <StatusBadge status={reading.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }) {
  const styles = {
    Danger: "bg-red-50 text-red-700 border-red-200",
    Safe:   "bg-green-50 text-green-700 border-green-200",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${styles[status] || "bg-gray-50 text-gray-700 border-gray-200"}`}>
      {status}
    </span>
  );
}
