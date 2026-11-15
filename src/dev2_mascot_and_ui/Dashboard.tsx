/**
 * ErgoGotchi Companion Dashboard.
 * Displays real-time Tiger Data continuous aggregates, strain velocity,
 * biomechanical stretch guides, and Google Gemini coaching history.
 */

import React, { useState, useEffect } from 'react';
import { PetState, StretchCue } from '../types';

interface DashboardProps {
  hp: number;
  state: PetState;
  strainIndex: number;
  blinkRate: number;
  worstSignal: string;
  isDemoMode: boolean;
  onToggleDemoMode: () => void;
  onForceState: (state: PetState) => void;
  onRecalibrate: () => void;
  sessionId: string;
}

export const Dashboard: React.FC<DashboardProps> = ({
  hp,
  state,
  strainIndex,
  blinkRate,
  worstSignal,
  isDemoMode,
  onToggleDemoMode,
  onForceState,
  onRecalibrate,
  sessionId,
}) => {
  const [activeTab, setActiveTab] = useState<'analytics' | 'stretches' | 'tigerdata' | 'simulator'>('analytics');
  const [seriesData, setSeriesData] = useState<any[]>([]);
  const [sessionSummary, setSessionSummary] = useState<string>('Analyzing your focus session...');
  const [tigerStats, setTigerStats] = useState<any>(null);

  // Fetch 30-minute series and summary from backend
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`http://localhost:8000/sessions/${sessionId}/series?minutes=30`);
        if (res.ok) {
          const json = await res.json();
          if (json.data && json.data.length > 0) {
            setSeriesData(json.data);
          }
        }

        const sumRes = await fetch(`http://localhost:8000/sessions/${sessionId}/summary`);
        if (sumRes.ok) {
          const sumJson = await sumRes.json();
          setSessionSummary(sumJson.summary);
        }

        const tigerRes = await fetch('http://localhost:8000/tiger-data/stats');
        if (tigerRes.ok) {
          const tJson = await tigerRes.json();
          setTigerStats(tJson);
        }
      } catch (err) {
        // Backend offline / local fallback mode
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [sessionId]);

  return (
    <div className="w-full max-w-5xl mx-auto bg-slate-950 text-slate-100 rounded-3xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col my-4">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between px-6 py-4 bg-slate-900/90 border-b border-slate-800 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center font-black text-slate-950 shadow-md">
            EG
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              ErgoGotchi Companion
              <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                sunhacks 2026
              </span>
            </h1>
            <p className="text-xs text-slate-400">Biometric Ergonomic Telemetry & Gemini Persona Engine</p>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleDemoMode}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
              isDemoMode
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-lg shadow-amber-500/10'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
          >
            {isDemoMode ? '⚡ Demo Mode: ON (1.5s Dwell)' : 'Normal Mode'}
          </button>

          <button
            onClick={onRecalibrate}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-all shadow"
          >
            Calibrate Posture
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-900/40 px-6">
        {[
          { id: 'analytics', label: '📊 Telemetry & Fatigue' },
          { id: 'stretches', label: '🧘 Biomechanical Stretches' },
          { id: 'tigerdata', label: '🐅 Tiger Data TimescaleDB' },
          { id: 'simulator', label: '🎮 Presenter Hotkeys' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-3 text-xs font-semibold transition-all border-b-2 ${
              activeTab === tab.id
                ? 'border-emerald-400 text-emerald-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="p-6 overflow-y-auto max-h-[70vh]">
        {/* Real-Time Live Status Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-900/70 p-4 rounded-2xl border border-slate-800 shadow">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Mascot HP</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-white">{Math.round(hp)}%</span>
              <span className={`text-xs font-bold ${hp >= 80 ? 'text-emerald-400' : hp >= 40 ? 'text-amber-400' : 'text-rose-400'}`}>
                {state}
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  hp >= 80 ? 'bg-emerald-400' : hp >= 40 ? 'bg-amber-400' : 'bg-rose-500'
                }`}
                style={{ width: `${Math.max(4, hp)}%` }}
              />
            </div>
          </div>

          <div className="bg-slate-900/70 p-4 rounded-2xl border border-slate-800 shadow">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Strain Index</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-white">{(strainIndex * 100).toFixed(0)}%</span>
              <span className="text-xs text-slate-400">worst: {worstSignal.replace('_', ' ')}</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className="h-full bg-indigo-400 transition-all duration-300"
                style={{ width: `${strainIndex * 100}%` }}
              />
            </div>
          </div>

          <div className="bg-slate-900/70 p-4 rounded-2xl border border-slate-800 shadow">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Blink Rate</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-white">{blinkRate}</span>
              <span className="text-xs text-slate-400">blinks/min</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              {blinkRate >= 10 ? 'Healthy ocular hydration' : 'Optical fixation warning'}
            </p>
          </div>

          <div className="bg-slate-900/70 p-4 rounded-2xl border border-slate-800 shadow">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Discipline Rank</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-black text-amber-300">Spine Guru</span>
              <span className="text-xs text-emerald-400 font-bold">Lvl 4</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">420 XP to Next Posture Tier</p>
          </div>
        </div>

        {/* Tab 1: Telemetry & Fatigue Charts */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            {/* Gemini Session Summary Callout */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/40 border border-emerald-500/20 shadow">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">✨</span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                  Google Gemini Ergonomic Coach Brief
                </h3>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed italic">
                "{sessionSummary}"
              </p>
            </div>

            {/* Fatigue & Strain Velocity Curve */}
            <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>📈</span> 30-Minute Strain Velocity Curve (Tiger Data 1-Min Buckets)
                </h3>
                <span className="text-[11px] text-slate-400 font-mono">Continuous Aggregate: ergo_1min</span>
              </div>

              {seriesData.length > 0 ? (
                <div className="h-48 w-full flex items-end gap-1.5 pt-4 pb-2 border-b border-slate-800">
                  {seriesData.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group relative">
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col bg-slate-950 text-[10px] text-slate-200 p-2 rounded border border-slate-700 whitespace-nowrap z-30 shadow-xl">
                        <span>Time: {new Date(d.bucket).toLocaleTimeString()}</span>
                        <span>Strain: {(d.avg_strain * 100).toFixed(0)}%</span>
                        <span>Velocity: {d.strain_velocity > 0 ? `+${d.strain_velocity}` : d.strain_velocity}</span>
                      </div>
                      <div
                        className="w-full rounded-t transition-all duration-300 hover:brightness-125"
                        style={{
                          height: `${Math.max(8, d.avg_strain * 100)}%`,
                          backgroundColor:
                            d.avg_strain >= 0.5 ? '#f43f5e' : d.avg_strain >= 0.3 ? '#f59e0b' : '#10b981',
                        }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
                  <p className="text-xs font-medium">Accumulating 1-minute time series data...</p>
                  <p className="text-[11px] text-slate-600 mt-1">Sit upright or slouch to see live continuous aggregates.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Biomechanical Stretches */}
        {activeTab === 'stretches' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                cue: 'CHIN_TUCK',
                title: 'Cervical Retraction (Chin Tuck)',
                trigger: 'Forward Head Posture (Turtle Neck)',
                desc: 'Pull your head straight back horizontally as if making a double chin. Hold 5 seconds. Repeat 3 times.',
                benefit: 'Re-aligns C1-C7 vertebrae and relieves occipital tendon strain.',
              },
              {
                cue: 'SHOULDER_ROLL',
                title: 'Thoracic Scapular Retraction',
                trigger: 'Hunched Shoulders & Slumping',
                desc: 'Roll both shoulders up toward your ears, then sweep them back and down. Squeeze your shoulder blades.',
                benefit: 'Releases trapezius tension and expands the rib cage.',
              },
              {
                cue: 'SIT_BACK',
                title: 'Pelvic Neutral Alignment',
                trigger: 'Screen Creep & Hip Sliding',
                desc: 'Slide your hips firmly to the back of the seat. Support your lumbar curve against the chair backrest.',
                benefit: 'Prevents lumbar disc compression and spinal lordosis.',
              },
              {
                cue: 'LOOK_AWAY',
                title: '20-20-20 Ocular Reset',
                trigger: 'Low Blink Rate & Optical Fixation',
                desc: 'Look away from your screen at an object at least 20 feet away for 20 seconds.',
                benefit: 'Relaxes ciliary eye muscles and stimulates tear film lubrication.',
              },
            ].map((stretch) => (
              <div key={stretch.cue} className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    {stretch.cue}
                  </span>
                  <span className="text-[11px] text-slate-400">Trigger: {stretch.trigger}</span>
                </div>
                <h4 className="text-sm font-bold text-white">{stretch.title}</h4>
                <p className="text-xs text-slate-300 leading-relaxed">{stretch.desc}</p>
                <div className="pt-2 text-[11px] text-emerald-400 font-medium">✓ {stretch.benefit}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 3: Tiger Data (TimescaleDB) Showcase */}
        {activeTab === 'tigerdata' && (
          <div className="space-y-6">
            <div className="p-5 bg-slate-900/80 rounded-2xl border border-slate-800">
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <span>🐅</span> Tiger Data / TimescaleDB Hypertable Architecture
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                ErgoGotchi ingests continuous 1 Hz biometric telemetry frames into a PostgreSQL hypertable partitioned
                into 1-hour temporal chunks. Continuous aggregates maintain 1-minute real-time rolling summaries with
                automatic 90%+ compression policies on historical data.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Engine</span>
                <p className="text-sm font-bold text-emerald-400 mt-1">
                  {tigerStats?.storage_engine || 'TimescaleDB (Tiger Data)'}
                </p>
              </div>
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Total Telemetry Rows</span>
                <p className="text-sm font-bold text-white mt-1">
                  {tigerStats?.telemetry_rows ? tigerStats.telemetry_rows.toLocaleString() : '86,400+ / day'}
                </p>
              </div>
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Aggregate View</span>
                <p className="text-sm font-bold text-cyan-400 mt-1">ergo_1min (Continuous)</p>
              </div>
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Compression</span>
                <p className="text-sm font-bold text-amber-400 mt-1">Segmented by session_id</p>
              </div>
            </div>

            <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto">
              <p className="text-emerald-400 font-bold mb-1">-- Real-time Continuous Aggregate Definition:</p>
              <pre>{`CREATE MATERIALIZED VIEW ergo_1min
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
  time_bucket('1 minute', recorded_at) AS bucket,
  session_id,
  avg(strain_index)   AS avg_strain,
  max(strain_index)   AS peak_strain,
  avg(forward_head)   AS avg_forward_head,
  avg(head_drop)      AS avg_head_drop,
  avg(blink_rate_1m)  AS avg_blink_rate,
  min(hp)             AS min_hp
FROM ergo_telemetry
WHERE present
GROUP BY bucket, session_id;`}</pre>
            </div>
          </div>
        )}

        {/* Tab 4: Presenter Hotkeys */}
        {activeTab === 'simulator' && (
          <div className="space-y-5">
            <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800">
              <h3 className="text-sm font-bold text-white mb-2">⚡ 3-Minute Hackathon Demo Script Controller</h3>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                Use these hotkeys or buttons during judging if venue lighting interferes with the webcam, or to demonstrate
                instant transitions to the judges!
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <button
                  onClick={() => onForceState('THRIVING')}
                  className="p-3 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-300 font-bold text-xs"
                >
                  Force Thriving [1]
                </button>
                <button
                  onClick={() => onForceState('SLOUCHING')}
                  className="p-3 rounded-xl bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/40 text-amber-300 font-bold text-xs"
                >
                  Force Slouching [2]
                </button>
                <button
                  onClick={() => onForceState('WILTED')}
                  className="p-3 rounded-xl bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/40 text-rose-300 font-bold text-xs"
                >
                  Force Wilted [3]
                </button>
                <button
                  onClick={() => onForceState('NEUTRAL')}
                  className="p-3 rounded-xl bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 font-bold text-xs"
                >
                  Reset Neutral [4]
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
