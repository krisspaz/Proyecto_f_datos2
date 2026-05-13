import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Events from './pages/Events';
import QueueHealth from './pages/QueueHealth';
import Storage from './pages/Storage';
import Analytics from './pages/Analytics';
import CloudCosts from './pages/CloudCosts';
import Architecture from './pages/Architecture';

export default function App() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <main className={`flex-1 overflow-hidden transition-all duration-200 ${collapsed ? 'ml-16' : 'ml-64'}`}>
        <Routes>
          {/* Rutas concretas primero; el * solo debe coger URLs que no existan en la app */}
          <Route path="/architecture" element={<Architecture />} />
          <Route path="/events"       element={<Events />} />
          <Route path="/queue-health" element={<QueueHealth />} />
          <Route path="/storage"      element={<Storage />} />
          <Route path="/analytics"    element={<Analytics />} />
          <Route path="/cloud-costs" element={<CloudCosts />} />
          <Route path="/"             element={<Dashboard />} />
          <Route path="*"             element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
