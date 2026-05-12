import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Events from './pages/Events';
import QueueHealth from './pages/QueueHealth';
import Storage from './pages/Storage';

export default function App() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <main className={`flex-1 overflow-hidden transition-all duration-200 ${collapsed ? 'ml-16' : 'ml-64'}`}>
        <Routes>
          <Route path="/"             element={<Dashboard />} />
          <Route path="/events"       element={<Events />} />
          <Route path="/queue-health" element={<QueueHealth />} />
          <Route path="/storage"      element={<Storage />} />
          <Route path="*"             element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
