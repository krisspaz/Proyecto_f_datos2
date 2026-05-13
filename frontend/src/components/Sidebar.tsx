import { NavLink } from 'react-router-dom';

interface NavItem {
  to: string;
  icon: string;
  label: string;
}

const NAV: NavItem[] = [
  { to: '/',             icon: 'dashboard',    label: 'Dashboard' },
  { to: '/architecture', icon: 'account_tree', label: 'Arquitectura' },
  { to: '/events',       icon: 'dynamic_feed', label: 'Events' },
  { to: '/queue-health', icon: 'monitoring',   label: 'Queue Health' },
  { to: '/storage',      icon: 'storage',      label: 'Storage' },
  { to: '/analytics',    icon: 'bar_chart',    label: 'Analytics' },
  { to: '/cloud-costs',  icon: 'payments',     label: 'Costos AWS' },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-slate-950 border-r border-slate-800 flex flex-col z-50 transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Logo */}
      <div className={`flex items-center border-b border-slate-800 h-16 ${collapsed ? 'justify-center px-0' : 'px-4 gap-2'}`}>
        <div className="w-7 h-7 rounded bg-indigo-600 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-sm text-white">wifi_tethering</span>
        </div>
        {!collapsed && (
          <div>
            <h1 className="text-sm font-black text-white tracking-tight leading-none">Signal Catcher</h1>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest mt-0.5">Pipeline Monitoring</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                collapsed ? 'justify-center' : ''
              } ${
                isActive
                  ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                  : 'text-slate-500 hover:bg-slate-900 hover:text-slate-200 border border-transparent'
              }`
            }
          >
            <span className="material-symbols-outlined text-xl flex-shrink-0">{item.icon}</span>
            {!collapsed && item.label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div className={`py-3 border-t border-slate-800 ${collapsed ? 'flex flex-col items-center gap-2 px-0' : 'px-4 space-y-2'}`}>
        {!collapsed && (
          <>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)] animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Pipeline Active</span>
            </div>
            <p className="text-[10px] text-slate-600">Auto-refresh: 5s</p>
          </>
        )}
        {collapsed && (
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" title="Pipeline Active" />
        )}

        {/* Toggle button */}
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className="material-symbols-outlined text-base">
            {collapsed ? 'chevron_right' : 'chevron_left'}
          </span>
        </button>
      </div>
    </aside>
  );
}
