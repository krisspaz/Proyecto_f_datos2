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

const SAMPLE_PAYLOADS: Record<string, string> = {
  Impression: JSON.stringify(
    {
      impression_id: 'imp-demo-1',
      user_ip: '192.168.1.1',
      user_agent: 'Mozilla/5.0 (demo)',
      timestamp: '2026-05-10T14:30:00Z',
      state: 'CA',
      search_keywords: 'running shoes',
      session_id: 'session-demo',
      ads: [
        {
          advertiser: { advertiser_id: 'adv-1', advertiser_name: 'Demo Co' },
          campaign: { campaign_id: 'camp-1', campaign_name: 'Demo' },
          ad: {
            ad_id: 'ad-1',
            ad_name: 'Demo ad',
            ad_text: 'Text',
            ad_link: 'https://example.com',
            ad_position: 1,
            ad_format: 'banner_728x90',
          },
        },
      ],
    },
    null,
    2,
  ),
  Click: JSON.stringify(
    {
      click_id: 'click-demo-1',
      impression_id: 'imp-demo-1',
      timestamp: '2026-05-10T14:30:05Z',
      clicked_ad: {
        ad_id: 'ad-1',
        ad_position: 1,
        click_coordinates: { x: 250, y: 400, normalized_x: 0.65, normalized_y: 0.8 },
        time_to_click: 5.2,
      },
      user_info: { user_ip: '192.168.1.1', state: 'CA', session_id: 'session-demo' },
    },
    null,
    2,
  ),
  Conversion: JSON.stringify(
    {
      conversion_id: 'conv-demo-1',
      click_id: 'click-demo-1',
      impression_id: 'imp-demo-1',
      timestamp: '2026-05-10T14:45:00Z',
      conversion_type: 'purchase',
      conversion_value: 59.99,
      conversion_currency: 'USD',
      conversion_attributes: { order_id: 'order-1', items: [{ product_id: 'p1', quantity: 1, unit_price: 59.99 }] },
      attribution_info: { time_to_convert: 900, attribution_model: 'last_click' },
      user_info: { user_ip: '192.168.1.1', state: 'CA', session_id: 'session-demo' },
    },
    null,
    2,
  ),
};

export default function Events() {
  const [eventType, setEventType] = useState('Impression');
  const [payload, setPayload] = useState(SAMPLE_PAYLOADS.Impression);
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
                  onChange={(e) => {
                    const v = e.target.value;
                    setEventType(v);
                    setPayload(SAMPLE_PAYLOADS[v] ?? SAMPLE_PAYLOADS.Impression);
                  }}
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
