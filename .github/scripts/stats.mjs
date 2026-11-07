// Generates the profile's Activity and Top languages cards (dark + light SVGs).
// Runs in GitHub Actions (see .github/workflows/stats.yml). No dependencies, Node 20+.
//
// Env:
//   GITHUB_TOKEN   provided by Actions; used for the GraphQL contribution calendar
//   STATS_TOKEN    optional personal token; if set, private repos also count toward languages
//   GH_USER        GitHub username (defaults to the repo owner)
//   STATS_DATA     optional path to a local JSON file ({days, repos}) instead of calling the API

import fs from "node:fs";
import path from "node:path";

const USER = process.env.GH_USER || (process.env.GITHUB_REPOSITORY || "dcmcamihan/").split("/")[0];
const OUT = "assets/stats";
const SKIP_LANGS = new Set(["Jupyter Notebook", "Shell", "Dockerfile", "Makefile", "Batchfile", "PowerShell"]);
const TOP_N = 6;

const LANG_COLORS = {
  JavaScript: "#F1E05A", TypeScript: "#3178C6", HTML: "#E34C26", CSS: "#663399",
  Python: "#3572A5", Java: "#B07219", Kotlin: "#A97BFF", "C#": "#178600", "C++": "#F34B7D",
  C: "#555555", Dart: "#00B4AB", Go: "#00ADD8", PHP: "#4F5D95", Ruby: "#701516",
  Swift: "#F05138", Vue: "#41B883", SCSS: "#C6538C", Svelte: "#FF3E00", Rust: "#DEA584",
};

const THEMES = {
  dark: {
    bg: "#18181B", border: "#2E2E33", title: "#F0F0F0", muted: "#8B8B93", grid: "#2A2A2F",
    line: "#8FC9BB", fillTop: "#8FC9BB", fillTopOpacity: 0.35, track: "#26262B",
  },
  light: {
    bg: "#FFFFFF", border: "#D0D7DE", title: "#1F2328", muted: "#6E7781", grid: "#EAEEF2",
    line: "#2F9E8A", fillTop: "#2F9E8A", fillTopOpacity: 0.25, track: "#EEF1F4",
  },
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ---------------- data ---------------- */

async function gh(url, token, body) {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      "User-Agent": "profile-stats",
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${url}: ${await res.text()}`);
  return res.json();
}

async function fetchData() {
  if (process.env.STATS_DATA) return JSON.parse(fs.readFileSync(process.env.STATS_DATA, "utf8"));
  const token = process.env.STATS_TOKEN || process.env.GITHUB_TOKEN;

  const q = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{
    weeks{contributionDays{date contributionCount}}}}}}`;
  const cal = await gh("https://api.github.com/graphql", token, { query: q, variables: { login: USER } });
  const days = cal.data.user.contributionsCollection.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays.map((d) => [d.date, d.contributionCount]));

  const listUrl = process.env.STATS_TOKEN
    ? "https://api.github.com/user/repos?affiliation=owner&per_page=100"
    : `https://api.github.com/users/${USER}/repos?type=owner&per_page=100`;
  const list = await gh(listUrl, token);
  const repos = {};
  for (const r of list) {
    if (r.fork || r.archived) continue;
    repos[r.name] = await gh(r.languages_url, token);
  }
  return { days, repos };
}

/* ---------------- activity card ---------------- */

function weekly(days) {
  days = [...days].sort((a, b) => a[0].localeCompare(b[0]));
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    weeks.push({ start: chunk[0][0], total: chunk.reduce((s, d) => s + d[1], 0) });
  }
  return { weeks, total: days.reduce((s, d) => s + d[1], 0) };
}

function smoothPath(pts) {
  // Catmull-Rom to cubic Bezier, clamped so the curve never dips below the baseline
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  const maxY = Math.max(...pts.map((p) => p[1]));
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, Math.min(maxY, p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, Math.min(maxY, p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function activityCard(data, t) {
  const W = 520, H = 210;
  const { weeks, total } = weekly(data.days);
  const x0 = 24, x1 = W - 24, yTop = 72, yBase = 166;
  const max = Math.max(4, ...weeks.map((w) => w.total));
  const pts = weeks.map((w, i) => [
    x0 + (i / (weeks.length - 1)) * (x1 - x0),
    yBase - (w.total / max) * (yBase - yTop),
  ]);
  const line = smoothPath(pts);
  const area = `${line} L${x1},${yBase} L${x0},${yBase} Z`;

  const grid = [0.33, 0.66, 1].map((f) => {
    const y = (yBase - f * (yBase - yTop)).toFixed(1);
    return `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${t.grid}" stroke-dasharray="3 5"/>`;
  }).join("");

  // month labels at the first week of every other month
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let lastMonth = -1, labels = "", k = 0;
  weeks.forEach((w, i) => {
    const m = Number(w.start.slice(5, 7)) - 1;
    if (m !== lastMonth) {
      if (k++ % 2 === 0 && i < weeks.length - 2) {
        labels += `<text x="${pts[i][0].toFixed(1)}" y="${yBase + 22}" fill="${t.muted}" font-size="11" text-anchor="middle">${months[m]}</text>`;
      }
      lastMonth = m;
    }
  });

  const last = pts[pts.length - 1];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<title>Contribution activity over the last 12 months</title>
<defs>
  <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${t.fillTop}" stop-opacity="${t.fillTopOpacity}"/>
    <stop offset="1" stop-color="${t.fillTop}" stop-opacity="0"/>
  </linearGradient>
</defs>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="${t.bg}" stroke="${t.border}"/>
<text x="24" y="34" fill="${t.title}" font-size="15" font-weight="600">Activity</text>
<text x="24" y="53" fill="${t.muted}" font-size="12">Contributions per week · last 12 months</text>
<text x="${W - 24}" y="34" fill="${t.title}" font-size="15" font-weight="600" text-anchor="end">${total}</text>
<text x="${W - 24}" y="53" fill="${t.muted}" font-size="12" text-anchor="end">past year</text>
${grid}
<line x1="${x0}" y1="${yBase}" x2="${x1}" y2="${yBase}" stroke="${t.grid}"/>
<path d="${area}" fill="url(#fill)"/>
<path d="${line}" fill="none" stroke="${t.line}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="7" fill="${t.line}" opacity="0.2"/>
<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5" fill="${t.line}"/>
${labels}
</svg>`;
}

/* ---------------- languages card ---------------- */

function languageShares(repos) {
  // Each repo counts equally, split by its own language mix, so one huge
  // generated file (a notebook export, a bundled build) can't dominate.
  const score = {};
  for (const langs of Object.values(repos)) {
    const kept = Object.entries(langs).filter(([k]) => !SKIP_LANGS.has(k));
    const tot = kept.reduce((s, [, v]) => s + v, 0);
    if (!tot) continue;
    for (const [k, v] of kept) score[k] = (score[k] || 0) + v / tot;
  }
  const sum = Object.values(score).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(score).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, TOP_N).map(([k, v]) => [k, v / sum]);
  const topSum = top.reduce((s, [, v]) => s + v, 0);
  return top.map(([k, v]) => [k, v / topSum]); // normalise the shown languages to 100%
}

function languagesCard(data, t) {
  const W = 340, H = 210;
  const langs = languageShares(data.repos);
  const bx = 24, bw = W - 48, by = 72, bh = 10, gap = 3;
  const usable = bw - gap * (langs.length - 1);
  let x = bx, segs = "";
  langs.forEach(([name, share]) => {
    const w = Math.max(2, share * usable);
    segs += `<rect x="${x.toFixed(1)}" y="${by}" width="${w.toFixed(1)}" height="${bh}" fill="${LANG_COLORS[name] || "#8B8B93"}"/>`;
    x += w + gap;
  });

  const colW = bw / 2;
  const legend = langs.map(([name, share], i) => {
    const cx = bx + (i % 2) * colW, cy = 114 + Math.floor(i / 2) * 30;
    const pct = share * 100 < 1 ? "<1%" : `${(share * 100).toFixed(share * 100 < 10 ? 1 : 0)}%`;
    return `<circle cx="${cx + 5}" cy="${cy - 4}" r="5" fill="${LANG_COLORS[name] || "#8B8B93"}"/>
<text x="${cx + 18}" y="${cy}" fill="${t.title}" font-size="13" font-weight="500">${esc(name)}</text>
<text x="${cx + colW - 14}" y="${cy}" fill="${t.muted}" font-size="12" text-anchor="end">${pct}</text>`;
  }).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<title>Top languages across my repositories</title>
<defs><clipPath id="bar"><rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${bh / 2}"/></clipPath></defs>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="${t.bg}" stroke="${t.border}"/>
<text x="24" y="34" fill="${t.title}" font-size="15" font-weight="600">Top languages</text>
<text x="24" y="53" fill="${t.muted}" font-size="12">Across my repositories</text>
<g clip-path="url(#bar)"><rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="${t.track}"/>${segs}</g>
${legend}
</svg>`;
}

/* ---------------- main ---------------- */

const data = await fetchData();
fs.mkdirSync(OUT, { recursive: true });
for (const [name, t] of Object.entries(THEMES)) {
  fs.writeFileSync(path.join(OUT, `activity-${name}.svg`), activityCard(data, t));
  fs.writeFileSync(path.join(OUT, `languages-${name}.svg`), languagesCard(data, t));
}
console.log(`Wrote stats cards to ${OUT}/`);
