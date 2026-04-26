import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

console.log('Config:', { hasSpotifyId: !!SPOTIFY_CLIENT_ID, hasLastfm: !!LASTFM_API_KEY });

// Server-side Spotify token via Client Credentials (no user login needed)
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getSpotifyToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const res = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
      },
    }
  );
  cachedToken = res.data.access_token;
  tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
  return cachedToken!;
}

async function getDeezerBPM(artist: string, track: string): Promise<number | null> {
  try {
    const search = await axios.get('https://api.deezer.com/search', {
      params: { q: `${artist} ${track}`, limit: 1 },
    });
    const hit = search.data.data?.[0];
    if (!hit) return null;
    const details = await axios.get(`https://api.deezer.com/track/${hit.id}`);
    const bpm = details.data.bpm;
    return bpm && bpm > 0 ? bpm : null;
  } catch {
    return null;
  }
}

async function getLastFmSimilar(artist: string, track: string): Promise<Array<{ name: string; artist: string }>> {
  try {
    const res = await axios.get('https://ws.audioscrobbler.com/2.0/', {
      params: { method: 'track.getSimilar', artist, track, api_key: LASTFM_API_KEY, format: 'json', limit: 30 },
    });
    const tracks = res.data.similartracks?.track ?? [];
    return tracks.map((t: any) => ({
      name: t.name,
      artist: typeof t.artist === 'string' ? t.artist : t.artist.name,
    }));
  } catch {
    return [];
  }
}

async function resolveSpotifyTrack(artist: string, track: string) {
  try {
    const token = await getSpotifyToken();
    const res = await axios.get('https://api.spotify.com/v1/search', {
      params: { q: `${artist} ${track}`.slice(0, 200), type: 'track', limit: 1 },
      headers: { Authorization: `Bearer ${token}` },
    });
    const item = res.data.tracks?.items[0];
    if (!item) return null;
    return {
      id: item.id,
      name: item.name,
      artist: item.artists[0].name,
      albumArt: item.album.images[0]?.url,
      spotifyUrl: item.external_urls.spotify,
    };
  } catch {
    return null;
  }
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.post('/api/playlist/generate', async (req, res) => {
  const { startTrack, count = 10 } = req.body;

  try {
    const token = await getSpotifyToken();

    // 1. Resolve seed track
    let seedData: any;
    if (startTrack.includes('spotify.com/track/')) {
      const trackId = startTrack.split('track/')[1].split('?')[0];
      const r = await axios.get(`https://api.spotify.com/v1/tracks/${trackId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      seedData = r.data;
    } else {
      const r = await axios.get('https://api.spotify.com/v1/search', {
        params: { q: startTrack.slice(0, 200), type: 'track', limit: 1 },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.data.tracks.items.length) return res.status(404).json({ error: 'Track not found' });
      seedData = r.data.tracks.items[0];
    }

    const seedName = seedData.name;
    const seedArtist = seedData.artists[0].name;
    const seedBPM = await getDeezerBPM(seedArtist, seedName);
    console.log(`Seed: ${seedArtist} - ${seedName}, BPM: ${seedBPM}`);

    const playlistTracks = [{
      name: seedName,
      artist: seedArtist,
      id: seedData.id,
      albumArt: seedData.album.images[0]?.url,
      spotifyUrl: seedData.external_urls.spotify,
      bpm: seedBPM,
    }];

    const usedKeys = new Set([`${seedArtist}:${seedName}`.toLowerCase()]);
    let currentArtist = seedArtist;
    let currentTrack = seedName;
    let currentBPM = seedBPM;

    // 2. Build chain
    for (let i = 0; i < count - 1; i++) {
      const similar = await getLastFmSimilar(currentArtist, currentTrack);
      console.log(`Last.fm similar for "${currentTrack}": ${similar.length} results`);

      const candidates = similar.filter(t => !usedKeys.has(`${t.artist}:${t.name}`.toLowerCase()));
      if (!candidates.length) break;

      const withBPM = await Promise.all(
        candidates.slice(0, 8).map(async t => ({ ...t, bpm: await getDeezerBPM(t.artist, t.name) }))
      );

      let best = withBPM[0];
      if (currentBPM) {
        const hasBPM = withBPM.filter(t => t.bpm !== null);
        if (hasBPM.length) {
          hasBPM.sort((a, b) => Math.abs(a.bpm! - currentBPM!) - Math.abs(b.bpm! - currentBPM!));
          best = hasBPM[0];
        }
      }

      const spotify = await resolveSpotifyTrack(best.artist, best.name);
      usedKeys.add(`${best.artist}:${best.name}`.toLowerCase());
      if (!spotify) continue;

      console.log(`Step ${i + 1}: ${best.artist} - ${best.name}, BPM: ${best.bpm}`);
      playlistTracks.push({ ...spotify, bpm: best.bpm });
      currentArtist = best.artist;
      currentTrack = best.name;
      currentBPM = best.bpm;
    }

    res.json({ tracks: playlistTracks });
  } catch (error: any) {
    console.error('Generate error:', error.response?.data || error.message);
    res.status(500).json(error.response?.data || { error: 'Failed to generate' });
  }
});

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API server running at http://0.0.0.0:${PORT}`);
});
