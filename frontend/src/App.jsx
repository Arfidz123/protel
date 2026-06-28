import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { Dashboard } from "./pages/Dashboard";
import { Location } from "./pages/Location";
import { History } from "./pages/History";

function App() {
  return (
    <Router>
      <div className="w-full min-h-screen flex flex-col">
        <Navbar /> 

        <main className="flex-1 w-full">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/location" element={<Location />} />
            <Route path="/history" element={<History />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;