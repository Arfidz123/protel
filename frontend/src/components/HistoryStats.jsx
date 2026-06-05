import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

export function HistoryStats({ data }) {
  const totalDanger = data.filter(d => d.status === "Danger").length;
  const totalSafe = data.filter(d => d.status === "Safe").length;
  const dangerPct = data.length > 0 ? ((totalDanger / data.length) * 100).toFixed(1) : 0;
  
  const stats = [
    { 
      label: "Total Readings", 
      value: data.length, 
      color: "text-gray-900" 
    },
    { 
      label: "Danger", 
      value: totalDanger, 
      sub: `${dangerPct}%`,
      color: "text-red-600" 
    },
    { 
      label: "Safe", 
      value: totalSafe, 
      sub: `${(100 - dangerPct).toFixed(1)}%`,
      color: "text-green-600" 
    },
    { 
      label: "Latest Status", 
      value: data[0]?.status || "—", 
      color: data[0]?.status === "Danger" ? "text-red-600" : "text-green-600" 
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {stats.map((stat, i) => (
        <Card key={i} className="border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-gray-500 uppercase tracking-wider">
              {stat.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            {stat.sub && (
              <p className="text-xs text-gray-500 mt-1">{stat.sub}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
