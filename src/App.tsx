import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Music,
  Search,
  Sparkles,
  ExternalLink,
  Loader2,
  Disc,
  ArrowRight,
  AlertCircle,
  Copy,
  CheckCircle2,
} from 'lucide-react';

interface Track {
  name: string;
  artist: string;
  id: string;
  albumArt: string;
  spotifyUrl: string;
  bpm: number | null;
}

interface GenerateResult {
  tracks: Track[];
}

export default function App() {
  const [generating, setGenerating] = useState(false);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<{ message: string; details?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const generatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;

    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/playlist/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startTrack: query, count: 10 }),
      });

      const contentType = res.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        const text = await res.text();
        setError({ message: `Server error (${res.status})`, details: text.substring(0, 1000) });
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate');
      setResult(data);
    } catch (err: any) {
      setError({ message: err.message });
    } finally {
      setGenerating(false);
    }
  };

  const copyTrackList = () => {
    if (!result) return;
    const text = result.tracks
      .map((t, i) => `${i + 1}. ${t.artist} — ${t.name}${t.bpm ? ` (${Math.round(t.bpm)} BPM)` : ''}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-emerald-500 selection:text-black flex flex-col relative overflow-x-hidden">
      {/* Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-purple-600/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full bg-blue-600/20 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full bg-emerald-500/10 blur-[100px]" />
      </div>

      {/* Navbar */}
      <nav className="relative z-20 px-8 py-6 flex justify-between items-center backdrop-blur-md border-b border-white/10 sticky top-0 bg-[#050505]/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.3)]">
            <Music className="w-6 h-6 text-black" fill="currentColor" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Segue Studio</h1>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/30 hidden md:block">
          BPM-Matched Track Chains
        </span>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col md:flex-row p-4 md:p-8 gap-8 max-w-7xl mx-auto w-full">
        {/* Sidebar */}
        <div className="w-full md:w-1/3 flex flex-col gap-6">
          <div className="p-6 md:p-8 rounded-[32px] bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400 mb-6 flex items-center gap-2">
              <Sparkles className="w-3 h-3" /> The Anchor Song
            </h2>

            <form onSubmit={generatePlaylist} className="space-y-6">
              <div className="space-y-4">
                <label className="text-[10px] text-white/40 uppercase font-bold tracking-widest">
                  Spotify Link or Track Name
                </label>
                <div className="relative group">
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="e.g. Safe And Sound or Spotify URL..."
                    className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-5 pr-14 text-sm focus:outline-none focus:border-emerald-500/50 transition-all placeholder:text-white/20"
                    disabled={generating}
                  />
                  <button
                    type="submit"
                    disabled={generating || !query}
                    className="absolute right-2 top-2 p-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black transition-all disabled:opacity-30 active:scale-90"
                  >
                    {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-white/20 shrink-0 mt-0.5" />
                <p className="text-[11px] text-white/40 leading-relaxed italic">
                  Generates 10 BPM-matched tracks. Copy the list and add them to a Spotify playlist manually.
                </p>
              </div>
            </form>
          </div>

          {/* Mix Parameters Panel */}
          <div className="p-8 rounded-[32px] bg-white/5 backdrop-blur-xl border border-white/10 flex-1 hidden md:flex flex-col">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-8">Mix Parameters</h2>
            <div className="space-y-8 flex-1">
              <div>
                <div className="flex justify-between text-[10px] uppercase font-bold tracking-widest mb-3 text-white/30">
                  <span>Tempo Drift</span>
                  <span className="text-emerald-400">±3.5%</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: '40%' }}
                    className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[10px] uppercase font-bold tracking-widest mb-3 text-white/30">
                  <span>Similarity Source</span>
                  <span className="text-emerald-400">Last.fm</span>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1 py-3 rounded-xl bg-white/5 border border-emerald-500/30 flex items-center justify-center text-[10px] font-bold text-emerald-400">
                    BPM Match
                  </div>
                  <div className="flex-1 py-3 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-[10px] font-bold text-white/20">
                    Deezer
                  </div>
                </div>
              </div>

              <div className="pt-8">
                <div className="text-4xl font-black italic tracking-tighter opacity-10 leading-none">
                  PERFECT<br />TRANSITION
                </div>
              </div>
            </div>
            <p className="text-[10px] text-white/20 font-bold uppercase tracking-[0.3em] mt-auto">Algorithm Ver 2.0.0</p>
          </div>
        </div>

        {/* Results Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <AnimatePresence mode="wait">
            {!result ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-white/5 rounded-[40px] bg-white/[0.02] backdrop-blur-sm"
              >
                <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-8 border border-white/10 group overflow-hidden relative">
                  <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/20 to-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Music className="w-10 h-10 text-white/40 group-hover:text-emerald-400 transition-colors" />
                </div>
                <h3 className="text-5xl font-black tracking-tight mb-4">
                  FLOW <span className="text-emerald-500">STATE.</span>
                </h3>
                <p className="text-white/40 max-w-sm font-medium leading-relaxed">
                  Enter a seed track to generate a BPM-matched chain of 10 songs.
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="results"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex flex-col h-full"
              >
                <div className="flex justify-between items-end mb-8 px-2">
                  <div>
                    <h3 className="text-3xl font-bold tracking-tight mb-1">Harmonic Sequence</h3>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                        {result.tracks.length} Tracks
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white/30 px-2 py-1 rounded bg-white/5 border border-white/10">
                        BPM Matched
                      </span>
                    </div>
                  </div>
                  <button className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all text-white/50 hover:text-white">
                    <Disc className="w-4 h-4" />
                    Camelot Visualizer
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 relative">
                    <div className="absolute left-[calc(50%-0.5px)] top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-emerald-500/20 to-transparent hidden lg:block" />

                    {result.tracks.map((track, idx) => (
                      <motion.a
                        key={track.id}
                        href={track.spotifyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className={`p-4 rounded-2xl backdrop-blur-md flex gap-4 items-center group cursor-pointer transition-all ${
                          idx % 2 === 1 ? 'lg:translate-y-6' : ''
                        } ${
                          idx === 0
                            ? 'bg-emerald-500/10 border border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.1)]'
                            : 'bg-white/5 border border-white/10 hover:bg-white/10'
                        }`}
                      >
                        <div className="w-14 h-14 rounded-xl overflow-hidden shadow-2xl relative flex-shrink-0">
                          {track.albumArt && (
                            <img
                              src={track.albumArt}
                              alt={track.name}
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                            />
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <ExternalLink className="w-5 h-5 text-white" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-[9px] font-black uppercase tracking-widest mb-1 ${idx === 0 ? 'text-emerald-400' : 'text-white/30'}`}>
                            {idx === 0 ? 'Seed Track' : `Segue 0${idx}`}
                          </div>
                          <div className="text-sm font-bold truncate group-hover:text-emerald-400 transition-colors uppercase tracking-tight">
                            {track.name}
                          </div>
                          <div className="text-[10px] font-medium text-white/50 truncate italic">{track.artist}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {track.bpm && (
                            <span className="text-[9px] font-mono font-bold text-white/30">
                              {Math.round(track.bpm)} BPM
                            </span>
                          )}
                          <ArrowRight className="w-3 h-3 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </motion.a>
                    ))}
                  </div>
                </div>

                {/* Footer Action */}
                <div className="mt-8 p-6 md:p-8 rounded-[32px] bg-emerald-500 text-black flex flex-col sm:flex-row items-center justify-between shadow-[0_0_50px_-12px_rgba(16,185,129,0.4)] relative overflow-hidden">
                  <div className="absolute top-[-50%] left-[-10%] w-[200px] h-[200px] bg-white/20 blur-[60px] rounded-full pointer-events-none" />
                  <div className="relative z-10 text-center sm:text-left mb-6 sm:mb-0">
                    <h4 className="font-black text-2xl uppercase tracking-tighter leading-none mb-1">Ready to Flow.</h4>
                    <p className="text-xs font-bold opacity-60 tracking-wider">
                      Click any track to open in Spotify, or copy the full list.
                    </p>
                  </div>
                  <div className="relative z-10 flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                    <button
                      onClick={copyTrackList}
                      className="px-8 py-4 bg-black/20 hover:bg-black/30 text-black rounded-2xl font-black text-sm transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                    >
                      {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Copied!' : 'Copy Track List'}
                    </button>
                    <a
                      href={`https://open.spotify.com/track/${result.tracks[0]?.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-8 py-4 bg-white text-black rounded-2xl font-black text-sm transition-all hover:scale-105 active:scale-95 shadow-xl flex items-center justify-center gap-2"
                    >
                      Open Seed Track
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="mt-6 p-5 bg-red-500/10 border border-red-500/20 backdrop-blur-xl rounded-2xl text-red-400 flex flex-col gap-4"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 border border-red-500/20">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5 opacity-50 text-red-300">Error</p>
                    <p className="text-sm font-bold tracking-tight">{error.message}</p>
                  </div>
                  <button onClick={() => setError(null)} className="text-red-400/50 hover:text-red-400 p-2 transition-colors">
                    ✕
                  </button>
                </div>
                {error.details && (
                  <div className="bg-black/60 rounded-xl p-4 border border-white/5 max-h-40 overflow-y-auto">
                    <pre className="text-[10px] font-mono whitespace-pre-wrap opacity-60 leading-relaxed">{error.details}</pre>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <footer className="relative z-10 py-12 px-8 flex flex-col md:flex-row justify-between items-center gap-6 mt-12 bg-white/[0.02] border-t border-white/[0.05] backdrop-blur-xl">
        <div className="flex items-center gap-3 opacity-30 grayscale brightness-200">
          <Music className="w-5 h-5" />
          <span className="text-xs font-black tracking-[0.3em] uppercase">Segue Studio</span>
        </div>
        <p className="text-[10px] text-white/20 font-bold uppercase tracking-[0.4em]">
          Algorithms for the Soul • 2026
        </p>
        <div className="flex gap-8 text-[10px] font-bold uppercase tracking-widest text-white/20">
          <span className="hover:text-emerald-500 transition-colors cursor-pointer">Terms</span>
          <span className="hover:text-emerald-500 transition-colors cursor-pointer">Privacy</span>
        </div>
      </footer>
    </div>
  );
}
