#!/usr/bin/env node
/**
 * Signal Catcher — local stress tester
 * Mimics the professor's load profile (Tiers 1-4) against the API.
 *
 * Usage:
 *   node stress.js [options]
 *
 * Options:
 *   --host  <url>    API base URL  (default: http://localhost:4000)
 *   --tier  <1-4>    Load tier to run (default: 3)
 *   --rps   <n>      Custom RPS (overrides tier)
 *   --dur   <s>      Custom duration in seconds (overrides tier)
 *
 * Examples:
 *   node stress.js --tier 1
 *   node stress.js --tier 3 --host http://192.168.1.50:4000
 *   node stress.js --tier 3 --host https://abc123.ngrok-free.app
 *   node stress.js --rps 2000 --dur 60
 */
'use strict';

const http  = require('http');
const https = require('https');

// ── Tier definitions (match PDF exactly) ─────────────────────────────────────
const TIERS = {
  1: { rps: 100,  durationSec: 300 },
  2: { rps: 500,  durationSec: 300 },
  3: { rps: 1000, durationSec: 300 },
  4: { rps: 2000, durationSec: 60  },
  5: { rps: 4000, durationSec: 300 },
};

// ── CLI parsing ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const get  = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i+1] : def; };

const host       = get('--host', 'http://localhost:4000');
const tierNum    = parseInt(get('--tier', '3'), 10);
const customRps  = parseInt(get('--rps', '0'), 10);
const customDur  = parseInt(get('--dur', '0'), 10);

const tier       = TIERS[tierNum] ?? TIERS[3];
const TARGET_RPS = customRps || tier.rps;
const DURATION   = customDur || tier.durationSec;

// ── Data generators ───────────────────────────────────────────────────────────
const STATES  = ['CA','TX','NY','FL','IL','PA','OH','GA','NC','MI','WA','AZ','MA','CO','TN'];
const ADV_IDS = ['adv-nike','adv-apple','adv-amazon','adv-google','adv-meta'];
const CAMP    = (adv) => `camp-${adv.split('-')[1]}-${(Math.random()*10|0)+1}`;
const uid     = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const pick    = (arr) => arr[Math.floor(Math.random() * arr.length)];

const pendingImpressions = [];

function makeImpression() {
  const adv = pick(ADV_IDS);
  const imp = { impression_id: 'imp-' + uid(), adv };
  pendingImpressions.push(imp);
  if (pendingImpressions.length > 5000) pendingImpressions.shift();
  return {
    impression_id: imp.impression_id,
    user_ip: `10.${(Math.random()*254|0)}.${(Math.random()*254|0)}.${(Math.random()*254|0)}`,
    user_agent: 'SignalCatcherStress/1.0',
    timestamp: new Date().toISOString(),
    state: pick(STATES),
    search_keywords: pick(['shoes','laptop','coffee','camera','headphones','travel','fitness']),
    session_id: 'sess-' + uid(),
    ads: [{
      advertiser: { advertiser_id: adv, advertiser_name: adv },
      campaign:   { campaign_id: CAMP(adv), campaign_name: 'Campaign' },
      ad: {
        ad_id: 'ad-' + (Math.random()*100|0),
        ad_name: 'Ad',
        ad_text: 'Check this out',
        ad_link: 'https://example.com',
        ad_position: 1,
        ad_format: 'banner_728x90',
      },
    }],
  };
}

function makeClick() {
  const ref = pendingImpressions.length
    ? pendingImpressions[Math.floor(Math.random() * pendingImpressions.length)]
    : { impression_id: 'imp-' + uid(), adv: pick(ADV_IDS) };
  return {
    click_id: 'clk-' + uid(),
    impression_id: ref.impression_id,
    timestamp: new Date().toISOString(),
    clicked_ad: {
      ad_id: 'ad-' + (Math.random()*100|0),
      ad_position: 1,
      click_coordinates: { x: Math.random()*800|0, y: Math.random()*600|0, normalized_x: Math.random(), normalized_y: Math.random() },
      time_to_click: +(Math.random() * 30).toFixed(2),
    },
    user_info: {
      user_ip: '10.0.0.1',
      state: pick(STATES),
      session_id: 'sess-' + uid(),
    },
  };
}

function makeConversion() {
  const ref = pendingImpressions.length
    ? pendingImpressions[Math.floor(Math.random() * pendingImpressions.length)]
    : { impression_id: 'imp-' + uid(), adv: pick(ADV_IDS) };
  return {
    conversion_id: 'conv-' + uid(),
    click_id: 'clk-' + uid(),
    impression_id: ref.impression_id,
    timestamp: new Date().toISOString(),
    conversion_type: pick(['purchase','signup','download','trial']),
    conversion_value: +(Math.random() * 200 + 5).toFixed(2),
    conversion_currency: 'USD',
    conversion_attributes: { order_id: 'ord-' + uid() },
    attribution_info: {
      time_to_convert: Math.floor(Math.random() * 3600),
      attribution_model: 'last_click',
    },
    user_info: {
      user_ip: '10.0.0.1',
      state: pick(STATES),
      session_id: 'sess-' + uid(),
    },
  };
}

// 60% impressions, 30% clicks, 10% conversions
function nextEvent() {
  const r = Math.random();
  if (r < 0.60) return { path: '/api/events/impression', body: makeImpression() };
  if (r < 0.90) return { path: '/api/events/click',      body: makeClick() };
  return           { path: '/api/events/conversion',    body: makeConversion() };
}

// ── HTTP sender ───────────────────────────────────────────────────────────────
const baseUrl  = new URL(host);
const useHttps = baseUrl.protocol === 'https:';
const agent    = useHttps
  ? new https.Agent({ keepAlive: true, maxSockets: 1024 })
  : new http.Agent ({ keepAlive: true, maxSockets: 1024 });

function sendEvent({ path, body }) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body);
    const opts = {
      hostname: baseUrl.hostname,
      port:     baseUrl.port || (useHttps ? 443 : 80),
      path,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      agent,
    };
    const t0 = Date.now();
    const req = (useHttps ? https : http).request(opts, (res) => {
      res.resume();
      res.on('end', () => resolve({ ok: res.statusCode === 202, latency: Date.now() - t0 }));
    });
    req.on('error', () => resolve({ ok: false, latency: Date.now() - t0 }));
    req.write(payload);
    req.end();
  });
}

// ── Stats ─────────────────────────────────────────────────────────────────────
let sent = 0, ok = 0, err = 0;
const sentByType = { impression: 0, click: 0, conversion: 0 };
const okByType   = { impression: 0, click: 0, conversion: 0 };
const latencies = [];

function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length * p / 100)];
}

// ── Rate limiter ─────────────────────────────────────────────────────────────
// Fire TICK_MS-per-batch. At high RPS, batch multiple requests per tick.
const TICK_MS   = 10;
const PER_TICK  = Math.round(TARGET_RPS * TICK_MS / 1000) || 1;
const ACTUAL_RPS = PER_TICK * (1000 / TICK_MS);

// ── Main ──────────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
console.log(` Signal Catcher — Stress Tool`);
console.log(`${'═'.repeat(60)}`);
console.log(` Host     : ${host}`);
console.log(` Tier     : ${customRps ? 'custom' : tierNum}`);
console.log(` Target   : ${TARGET_RPS} rps (effective: ${ACTUAL_RPS} rps)`);
console.log(` Duration : ${DURATION}s`);
console.log(`${'─'.repeat(60)}\n`);

const startMs   = Date.now();
const endMs     = startMs + DURATION * 1000;
let lastReport  = startMs;
let lastSent    = 0;

const ticker = setInterval(() => {
  const now = Date.now();
  if (now >= endMs) {
    clearInterval(ticker);
    clearInterval(reporter);
    // Wait up to 3s for in-flight responses to settle before printing final stats
    setTimeout(printFinal, 3000);
    return;
  }
  for (let i = 0; i < PER_TICK; i++) {
    const ev = nextEvent();
    const type = ev.path.split('/').pop(); // impression | click | conversion
    sent++;
    sentByType[type] = (sentByType[type] || 0) + 1;
    sendEvent(ev).then(({ ok: wasOk, latency }) => {
      if (wasOk) { ok++; okByType[type] = (okByType[type] || 0) + 1; } else err++;
      if (latencies.length < 100_000) latencies.push(latency);
    });
  }
}, TICK_MS);

const reporter = setInterval(() => {
  const now       = Date.now();
  const elapsed   = ((now - startMs) / 1000).toFixed(0);
  const remaining = Math.max(0, ((endMs - now) / 1000).toFixed(0));
  const window    = (now - lastReport) / 1000;
  const rps       = ((sent - lastSent) / window).toFixed(0);
  const rate      = sent > 0 ? ((ok / sent) * 100).toFixed(2) : '0.00';
  const p95       = percentile(latencies, 95);
  lastSent   = sent;
  lastReport = now;
  process.stdout.write(
    `\r  [${elapsed}s / ${DURATION}s]  sent=${sent.toLocaleString()}  ok=${ok.toLocaleString()}  err=${err}  rps=${rps}  capture=${rate}%  p95=${p95}ms  remaining=${remaining}s   `
  );
}, 2000);

function printFinal() {
  const capture = sent > 0 ? ((ok / sent) * 100).toFixed(3) : '0.000';
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(`\n\n${'─'.repeat(60)}`);
  console.log(` RESULTS`);
  console.log(`${'─'.repeat(60)}`);
  console.log(` Duration      : ${elapsed}s`);
  console.log(` Total sent    : ${sent.toLocaleString()}`);
  console.log(` 202 OK        : ${ok.toLocaleString()}`);
  console.log(` Errors/non-202: ${err}`);
  console.log(` Still in-flight: ${Math.max(0, sent - ok - err).toLocaleString()}`);
  console.log(` Capture rate  : ${capture}%`);
  console.log(`${'─'.repeat(60)}`);
  console.log(` SENT BY TYPE`);
  console.log(`   Impressions : ${(sentByType.impression||0).toLocaleString()}`);
  console.log(`   Clicks      : ${(sentByType.click||0).toLocaleString()}`);
  console.log(`   Conversions : ${(sentByType.conversion||0).toLocaleString()}`);
  console.log(` ACCEPTED (202) BY TYPE`);
  console.log(`   Impressions : ${(okByType.impression||0).toLocaleString()}`);
  console.log(`   Clicks      : ${(okByType.click||0).toLocaleString()}`);
  console.log(`   Conversions : ${(okByType.conversion||0).toLocaleString()}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(` Latency p50   : ${percentile(latencies, 50)}ms`);
  console.log(` Latency p95   : ${percentile(latencies, 95)}ms`);
  console.log(` Latency p99   : ${percentile(latencies, 99)}ms`);
  console.log(`${'─'.repeat(60)}`);

  const TARGET_CAPTURE = { 1: 100, 2: 99.5, 3: 99, 4: 0 };
  const target = TARGET_CAPTURE[tierNum] ?? 99;
  if (parseFloat(capture) >= target) {
    console.log(` PASS — capture rate ${capture}% >= required ${target}%`);
  } else {
    console.log(` WARN — capture rate ${capture}% < required ${target}%`);
  }
  console.log(`${'═'.repeat(60)}\n`);
  console.log(` Verify in InfluxDB (may take up to 60s to fully appear):`);
  console.log(`   curl http://localhost:4000/api/metrics/summary\n`);
  process.exit(0);
}
