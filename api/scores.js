const TOUR_ENDPOINTS = {
  lpga: 'https://site.api.espn.com/apis/site/v2/sports/golf/lpga/scoreboard',
  pga:  'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard',
  eur:  'https://site.api.espn.com/apis/site/v2/sports/golf/eur/scoreboard',
};

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tour = (req.query.tour || req.body?.tour || 'lpga').toLowerCase();
  const url = TOUR_ENDPOINTS[tour] || TOUR_ENDPOINTS.lpga;

  try {
    const espnResp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!espnResp.ok) {
      return res.status(espnResp.status).json({ error: `ESPN returned ${espnResp.status}` });
    }

    const raw = await espnResp.json();
    const events = raw.events || [];

    if (!events.length) {
      return res.status(200).json({ tournament: 'No active tournament', round: '', players: [] });
    }

    const event = events[0];
    const competition = event.competitions?.[0];
    const roundNum = competition?.status?.period || null;
    const roundDetail = competition?.status?.type?.shortDetail || event.status?.type?.description || '';
    const competitors = competition?.competitors || [];

    const players = competitors.map((c) => {
      const athlete = c.athlete || {};
      const name = athlete.displayName || athlete.fullName || 'Unknown';

      // ── Headshot ──
      // ESPN provides headshots in athlete.headshot or athlete.flag (for LPGA intl players)
      let photo = null;
      if (athlete.headshot?.href) {
        photo = athlete.headshot.href;
      } else if (c.id) {
        photo = `https://a.espncdn.com/i/headshots/golf/players/full/${c.id}.png`;
      }

      // ── Round scores ──
      const stats = c.linescores || [];
      const getRound = (i) => {
        const s = stats[i];
        if (!s) return null;
        if (s.displayValue === '-' || s.displayValue === '' || s.displayValue === undefined) return null;
        const val = parseFloat(s.value);
        return isNaN(val) ? null : Math.round(val);
      };

      const r1 = getRound(0);
      const r2 = getRound(1);
      const r3 = getRound(2);
      const r4 = getRound(3);

      // ── To par ──
      let toPar = null;
      const toParRaw = c.score;
      if (toParRaw !== undefined && toParRaw !== null && toParRaw !== '') {
        const n = parseInt(toParRaw);
        if (!isNaN(n)) toPar = n;
        else if (String(toParRaw).toUpperCase() === 'E') toPar = 0;
      }

      // ── Status ──
      const statusStr = (c.status || '').toLowerCase();
      let playerStatus = 'active';
      if (statusStr.includes('cut')) playerStatus = 'cut';
      else if (statusStr.includes('wd') || statusStr.includes('withdraw')) playerStatus = 'wd';

      // ── Thru ──
      const thru = c.statistics?.find(s => s.name === 'holesCompleted')?.displayValue || null;

      // ── Flag ──
      const flag = athlete.flag?.href || null;

      return { name, photo, flag, toPar, r1, r2, r3, r4, thru, status: playerStatus };
    });

    // Sort: active by toPar, then cut/wd at bottom
    players.sort((a, b) => {
      const ca = a.status !== 'active', cb = b.status !== 'active';
      if (ca !== cb) return ca ? 1 : -1;
      return (a.toPar ?? 999) - (b.toPar ?? 999);
    });

    return res.status(200).json({
      tournament: event.name || event.shortName || '',
      round: roundDetail,
      players,
    });

  } catch (err) {
    console.error('ESPN fetch error:', err);
    return res.status(500).json({ error: err.message });
  }
}
