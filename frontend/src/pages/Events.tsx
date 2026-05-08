import { useState, useEffect, useRef } from 'react';
import { fireEvent, fetchRecentEvents, type RecentEvent } from '../api';

const TYPE_MAP: Record<string, string> = {
  Impression: 'impression',
  Click:      'click',
  Conversion: 'conversion',
};

const BADGE: Record<string, string> = {
  impressions: 'bg-indigo-500/10 text-indigo-400',
  clicks:      'bg-amber-500/10 text-amber-500',
  conversions: 'bg-emerald-500/10 text-emerald-400',
};

const DEFAULT_PAYLOAD = JSON.stringify({ ad_id: 'ad_001', user_id: 'usr_123', campaign_id: 'camp_42' }, null, 2);

export default function Events() {
  const [eventType, setEventType] = useState('Impression');
  const [payload, setPayload] = useState(DEFAULT_PAYLOAD);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [stream, setStream] = useState<RecentEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const seenRef = useRef(new Set<string>());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollStream = async () => {
    if (paused) return;
    try {
      const events = await fetchRecentEvents();
      const fresh = events.filter((e) => !seenRef.current.has(e.timestamp));
      fresh.forEach((e) => seenRef.current.add(e.timestamp));
      if (fresh.length > 0) {
        setStream((prev) => [...fresh, ...prev].slice(0, 50));
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    pollStream();
    timerRef.current = setInterval(pollStream, 3000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let parsed: object;
    try { parsed = JSON.parse(payload); }
    catch { setToast({ ok: false, msg: 'JSON inválido' }); return; }

    const endpoint = TYPE_MAP[eventType];
    const res = await fireEvent(endpoint, parsed);
    if (res.status === 202) {
      setToast({ ok: true, msg: `${eventType} enviado (202 Accepted)` });
    } else {
      setToast({ ok: false, msg: `Error: ${res.status}` });
    }
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Events</h2>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider">System Healthy</span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Fire Event form */}
        <section className="col-span-4 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-indigo-500/10 rounded-lg">
                <span className="material-symbols-outlined text-indigo-400">rocket_launch</span>
              </div>
              <div>
                <h3 className="font-bold text-slate-100">Fire Event</h3>
                <p className="text-xs text-slate-500">Inject manual signal</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Event Type
                </label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option>Impression</option>
                  <option>Click</option>
                  <option>Conversion</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Payload (JSON)
                </label>
                <textarea
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  rows={8}
                  spellCheck={false}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-sm text-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-colors active:scale-95"
              >
                <span className="material-symbols-outlined text-sm">send</span>
                Send Event
              </button>
            </form>
          </div>

          {/* Toast */}
          {toast && (
            <div className={`border rounded-xl p-4 flex items-center gap-3 ${toast.ok ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'}`}>
              <span className={`material-symbols-outlined ${toast.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                {toast.ok ? 'check_circle' : 'error'}
              </span>
              <p className="text-sm font-medium text-slate-200">{toast.msg}</p>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">En stream</p>
              <p className="text-2xl font-black text-indigo-400">{stream.length}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Estado</p>
              <p className="text-2xl font-black text-emerald-400">{paused ? 'PAUSA' : 'LIVE'}</p>
            </div>
          </div>
        </section>

        {/* Live stream */}
        <section className="col-span-8 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
          <header className="px-6 py-4 border-b border-slate-800 flex justify-between items-center sticky top-0 bg-slate-900">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${paused ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
              <span className="text-sm font-bold text-slate-200">Live Event Stream</span>
            </div>
            <button
              onClick={() => setPaused((p) => !p)}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined text-base">{paused ? 'play_arrow' : 'pause'}</span>
              {paused ? 'Resume' : 'Pause'}
            </button>
          </header>

          <div className="overflow-y-auto flex-1 max-h-[600px]">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-slate-950">
                <tr className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Timestamp</th>
                  <th className="px-5 py-3">Payload</th>
                  <th className="px-5 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-sm">
                {stream.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center text-slate-600 text-sm">
                      {paused ? 'Stream en pausa' : 'Esperando eventos...'}
                    </td>
                  </tr>
                ) : (
                  stream.map((e, i) => {
                    const ts = new Date(e.timestamp);
                    const timeStr = ts.toLocaleTimeString('es-GT', { hour12: false }) + '.' + ts.getMilliseconds().toString().padStart(3, '0');
                    return (
                      <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-5 py-3">
                          <span className={`${BADGE[e.type] ?? 'bg-slate-500/10 text-slate-400'} text-[10px] font-bold px-2 py-0.5 rounded-full uppercase`}>
                            {e.type}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-slate-400 font-mono text-xs">{timeStr}</td>
                        <td className="px-5 py-3 text-slate-500 font-mono text-xs truncate max-w-xs">{e.payload.slice(0, 80)}</td>
                        <td className="px-5 py-3 text-right text-emerald-400 text-xs font-medium">OK</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
