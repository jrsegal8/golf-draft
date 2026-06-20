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
    const roundDetail = competition?.status?.type?.shortDetail || event.status?.type?.description || '';
    const competitors = competition?.competitors || [];

    // ── Fetch course name + all competitor statuses in parallel ──
    const eventId = event.id;
    const coreBase = `https://sports.core.api.espn.com/v2/sports/golf/leagues/${tour}/events/${eventId}`;

    const [courseName, statusMap] = await Promise.all([
      // Course name
      fetch(`${coreBase}?lang=en&region=us`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          const course = d?.courses?.[0];
          if (!course?.name) return '';
          const city = course.address?.city || '';
          const state = course.address?.state || '';
          return city && state ? `${course.name} · ${city}, ${state}` : course.name;
        })
        .catch(() => ''),

      // All competitor statuses in parallel
      Promise.all(
        competitors.map(c =>
          fetch(`${coreBase}/competitions/${eventId}/competitors/${c.id}/status?lang=en&region=us`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
          })
            .then(r => r.ok ? r.json() : null)
            .then(d => [c.id, d?.type?.name || ''])
            .catch(() => [c.id, ''])
        )
      ).then(entries => Object.fromEntries(entries)),
    ]);

    const players = competitors.map((c) => {
      const athlete = c.athlete || {};
      const name = athlete.displayName || athlete.fullName || 'Unknown';

      // ── Headshot ──
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

      // ── Status — use ESPN core API status (STATUS_CUT, STATUS_WD, etc.) ──
      const coreStatus = (statusMap[c.id] || '').toUpperCase();
      let playerStatus = 'active';
      if (coreStatus.includes('CUT')) playerStatus = 'cut';
      else if (coreStatus.includes('WD') || coreStatus.includes('WITHDRAW')) playerStatus = 'wd';

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
      course: courseName,
      players,
    });

  } catch (err) {
    console.error('ESPN fetch error:', err);
    return res.status(500).json({ error: err.message });
  }
}
