import { Link } from "react-router-dom";

export function Navbar() {
  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
      <h1 className="font-bold text-xl text-blue-600">Rip-Current Monitor</h1>
      <div className="space-x-6">
        <Link to="/" className="text-gray-600 hover:text-blue-600 font-medium">Dashboard</Link>
        <Link to="/location" className="text-gray-600 hover:text-blue-600 font-medium">Location</Link>
        <Link to="/history" className="text-gray-600 hover:text-blue-600 font-medium">History</Link>
      </div>
    </nav>
  );
}