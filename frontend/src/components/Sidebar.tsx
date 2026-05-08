import { NavLink } from 'react-router-dom';

interface NavItem {
  to: string;
  icon: string;
  label: string;
}

const NAV: NavItem[] = [
  { to: '/', icon: 'dashboard', label: 'Dashboard' },
  { to: '/events', icon: 'dynamic_feed', label: 'Events' },
  { to: '/queue-health', icon: 'monitoring', label: 'Queue Health' },
];

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-slate-950 border-r border-slate-800 flex flex-col z-50">
      <div className="px-6 py-5 border-b border-slate-800">
        <h1 className="text-lg font-bold text-white tracking-tight">Signal Catcher</h1>
        <p className="text-xs text-slate-500 mt-0.5">Pipeline Monitoring</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-500/10 text-indigo-400 border-r-4 border-indigo-500'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`
            }
          >
            <span className="material-symbols-outlined text-xl">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-slate-800">
        <div className="flex items-center gap-2 mb-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
          <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider">Pipeline Active</span>
        </div>
        <p className="text-xs text-slate-600">Auto-refresh: 10s</p>
      </div>
    </aside>
  );
}
