import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

export function HistoryTable({ data }) {
  return (
    <Card className="border-gray-200 shadow-sm">
      <CardHeader className="pb-3 border-b border-gray-100">
        <CardTitle className="text-sm text-gray-500">Historical Readings (3 Buoys + Wave Intensity)</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[600px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
              <TableRow className="border-gray-100">
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Time</TableHead>
                <TableHead className="text-xs text-right">D1 v</TableHead>
                <TableHead className="text-xs text-right">D1 °</TableHead>
                <TableHead className="text-xs text-right">D1 wave</TableHead>
                <TableHead className="text-xs text-right">D2 v</TableHead>
                <TableHead className="text-xs text-right">D2 °</TableHead>
                <TableHead className="text-xs text-right">D2 wave</TableHead>
                <TableHead className="text-xs text-right">D3 v</TableHead>
                <TableHead className="text-xs text-right">D3 °</TableHead>
                <TableHead className="text-xs text-right">D3 wave</TableHead>
                <TableHead className="text-xs text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r, i) => (
                <TableRow key={i} className="border-gray-100 hover:bg-gray-50">
                  <TableCell className="text-xs">{r.date}</TableCell>
                  <TableCell className="text-xs tabular-nums">{r.time}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{r.device1Speed?.toFixed(2)}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{Math.round(r.device1Direction || 0)}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{r.device1Wave?.toFixed(1)}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{r.device2Speed?.toFixed(2)}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{Math.round(r.device2Direction || 0)}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{r.device2Wave?.toFixed(1)}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{r.device3Speed?.toFixed(2)}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{Math.round(r.device3Direction || 0)}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{r.device3Wave?.toFixed(1)}</TableCell>
                  <TableCell className="text-center">
                    <StatusBadge status={r.status} />
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
    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${styles[status] || "bg-gray-50 text-gray-700"}`}>
      {status}
    </span>
  );
}
