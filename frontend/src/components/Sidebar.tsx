import { NavLink } from 'react-router-dom';

interface NavItem {
  to: string;
  icon: string;
  label: string;
}

const NAV: NavItem[] = [
  { to: '/',            icon: 'dashboard',    label: 'Dashboard' },
  { to: '/events',      icon: 'dynamic_feed', label: 'Events' },
  { to: '/queue-health', icon: 'monitoring',  label: 'Queue Health' },
  { to: '/storage',     icon: 'storage',      label: 'Storage' },
];

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-slate-950 border-r border-slate-800 flex flex-col z-50">
      <div className="px-6 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-sm text-white">wifi_tethering</span>
          </div>
          <h1 className="text-base font-black text-white tracking-tight">Signal Catcher</h1>
        </div>
        <p className="text-[10px] text-slate-500 uppercase tracking-widest">Pipeline Monitoring</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                  : 'text-slate-500 hover:bg-slate-900 hover:text-slate-200 border border-transparent'
              }`
            }
          >
            <span className="material-symbols-outlined text-xl">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-slate-800 space-y-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)] animate-pulse" />
          <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Pipeline Active</span>
        </div>
        <p className="text-[10px] text-slate-600">Auto-refresh: 5s</p>
      </div>
    </aside>
  );
}
