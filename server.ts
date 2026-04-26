import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const APP_URL = process.env.APP_URL;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());

  // Health check
  app.get('/api/ping', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Spotify Auth Logic
  const getRedirectUri = () => {
    return `${APP_URL}/auth/callback`;
  };

  app.get('/api/auth/url', (req, res) => {
    console.log('--- Auth Request Started ---');
    console.log('APP_URL:', APP_URL);
    console.log('SPOTIFY_CLIENT_ID exists:', !!SPOTIFY_CLIENT_ID);
    console.log('SPOTIFY_CLIENT_SECRET exists:', !!SPOTIFY_CLIENT_SECRET);

    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !APP_URL) {
      console.error('Critical Error: Missing environment variables');
      return res.status(500).json({ 
        error: 'Server configuration missing. Please check your Secrets for SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and APP_URL.' 
      });
    }

    const scope = 'playlist-modify-public user-read-private user-read-email';
    const redirectUri = getRedirectUri();
    console.log('Redirect URI:', redirectUri);

    const params = new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: scope,
    });
    
    const url = `https://accounts.spotify.com/authorize?${params.toString()}`;
    console.log('Generated Spotify URL:', url);
    res.json({ url });
  });

  app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send('No code provided');
    }

    try {
      const response = await axios.post('https://accounts.spotify.com/api/token', 
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: code as string,
          redirect_uri: getRedirectUri(),
          client_id: SPOTIFY_CLIENT_ID!,
          client_secret: SPOTIFY_CLIENT_SECRET!,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const { access_token, refresh_token, expires_in } = response.data;

      // Set cookies with required AI Studio settings
      res.cookie('spotify_access_token', access_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: expires_in * 1000,
      });

      res.cookie('spotify_refresh_token', refresh_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      res.send(`
        <html>
          <body style="background: #111; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh;">
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. Closing window...</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error('Auth error:', error.response?.data || error.message);
      res.status(500).send('Authentication failed');
    }
  });

  app.get('/api/user/me', async (req, res) => {
    const token = req.cookies.spotify_access_token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const response = await axios.get('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      res.json(response.data);
    } catch (error: any) {
      res.status(error.response?.status || 500).json(error.response?.data || { error: 'Failed to fetch user' });
    }
  });

  app.post('/api/playlist/generate', async (req, res) => {
    const { startTrack, count = 10 } = req.body;
    const token = req.cookies.spotify_access_token;

    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      // 1. Resolve start track
      let trackId = '';
      if (startTrack.includes('spotify.com/track/')) {
        trackId = startTrack.split('track/')[1].split('?')[0];
      } else {
        const searchRes = await axios.get('https://api.spotify.com/v1/search', {
          params: { q: startTrack, type: 'track', limit: 1 },
          headers: { Authorization: `Bearer ${token}` }
        });
        if (searchRes.data.tracks.items.length === 0) {
          return res.status(404).json({ error: 'Track not found' });
        }
        trackId = searchRes.data.tracks.items[0].id;
      }

      // 2. Fetch seed track details and artist details for genre anchoring
      const seedTrackRes = await axios.get(`https://api.spotify.com/v1/tracks/${trackId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const seedTrack = seedTrackRes.data;
      const seedArtistId = seedTrack.artists[0].id;

      // Fetch audio features for the baseline mood
      const seedFeaturesRes = await axios.get(`https://api.spotify.com/v1/audio-features/${trackId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const seedFeatures = seedFeaturesRes.data;

      const playlistTracks = [seedTrack];
      const trackIds = [trackId];

      // 3. Recursive Segue Logic
      for (let i = 0; i < count - 1; i++) {
        const currentId = trackIds[trackIds.length - 1];
        
        // Get audio features of the PREVIOUS track for smooth segue
        const featuresRes = await axios.get(`https://api.spotify.com/v1/audio-features/${currentId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const features = featuresRes.data;

        // Recommendations based on current track features + original track anchors
        // We use seed_artists to keep genre consistent and seed_tracks for the segue
        const recsRes = await axios.get('https://api.spotify.com/v1/recommendations', {
          params: {
            seed_tracks: currentId,
            seed_artists: seedArtistId,
            target_tempo: features.tempo,
            target_key: features.key,
            target_mode: features.mode,
            target_energy: seedFeatures.energy, // Anchor to original mood
            target_danceability: seedFeatures.danceability, // Anchor to original vibe
            limit: 20
          },
          headers: { Authorization: `Bearer ${token}` }
        });

        // Pick a new track
        let found = false;
        for (const candidate of recsRes.data.tracks) {
          if (!trackIds.includes(candidate.id)) {
            playlistTracks.push(candidate);
            trackIds.push(candidate.id);
            found = true;
            break;
          }
        }
        if (!found) break; // End chain if no more unique tracks found
      }

      // 4. Create Playlist
      const userRes = await axios.get('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const userId = userRes.data.id;

      const newPlaylistRes = await axios.post(`https://api.spotify.com/v1/users/${userId}/playlists`, {
        name: `Segue: ${seedTrack.name}`,
        description: `Smooth transitions starting from ${seedTrack.name}. Created with Segue App.`,
        public: true
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const playlist = newPlaylistRes.data;

      // 5. Add tracks to playlist
      await axios.post(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
        uris: trackIds.map(id => `spotify:track:${id}`)
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      res.json({
        playlistUrl: playlist.external_urls.spotify,
        tracks: playlistTracks.map(t => ({
          name: t.name,
          artist: t.artists[0].name,
          id: t.id,
          albumArt: t.album.images[0]?.url
        }))
      });

    } catch (error: any) {
      console.error('Playlist error:', error.response?.data || error.message);
      res.status(500).json(error.response?.data || { error: 'Failed to generate playlist' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('spotify_access_token', { secure: true, sameSite: 'none' });
    res.clearCookie('spotify_refresh_token', { secure: true, sameSite: 'none' });
    res.json({ success: true });
  });

  // Vite Integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`READY: Server running at http://0.0.0.0:${PORT}`);
  });
}

console.log('INIT: Starting startServer()...');
startServer().catch((err) => {
  console.error('FAILED TO START SERVER:', err);
});
