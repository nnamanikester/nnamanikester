#!/usr/bin/env node
// Generates the profile README artwork: a hero banner and a live stats
// dashboard, each in a dark and a light variant.
//
//   GITHUB_TOKEN=... node scripts/build.mjs
//
// With a token it uses the GraphQL API (what the scheduled workflow does).
// Without one it falls back to public REST endpoints so it can run locally.

import { mkdir, writeFile } from "node:fs/promises";

const USER = process.env.GH_USER || "nnamanikester";
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const OUT = new URL("../assets/", import.meta.url);

// ─── Design tokens ──────────────────────────────────────────────────────────

const ACCENT = ["#8B5CF6", "#EC4899", "#F59E0B"]; // violet → pink → amber

const THEMES = {
  dark: {
    bg: "#0B0A12",
    surface: "#13111C",
    surface2: "#1A1726",
    border: "#2A2638",
    text: "#F4F2FA",
    muted: "#9A95AD",
    faint: "#5C576E",
    grid: "#FFFFFF",
    gridOpacity: 0.05,
    orbOpacity: 0.55,
    heat: ["#1C1A28", "#2E2452", "#4C2F9A", "#7C4DEB", "#B794F6"],
    code: { key: "#C4B5FD", str: "#FBCFE8", kw: "#F9A8D4", punct: "#7C7791", bool: "#FCD34D" },
  },
  light: {
    bg: "#FBFAFE",
    surface: "#FFFFFF",
    surface2: "#F4F2FA",
    border: "#E6E2F0",
    text: "#15121F",
    muted: "#625D74",
    faint: "#A39EB3",
    grid: "#1A1530",
    gridOpacity: 0.06,
    orbOpacity: 0.35,
    heat: ["#EEEBF5", "#DDD3FB", "#B9A2F8", "#8B5CF6", "#5B21B6"],
    code: { key: "#6D28D9", str: "#BE185D", kw: "#9D174D", punct: "#8E89A0", bool: "#B45309" },
  },
};

const SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif`;
const MONO = `ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace`;

const LANG_COLORS = {
  TypeScript: "#3178C6", JavaScript: "#F1E05A", Java: "#B07219", Kotlin: "#A97BFF",
  PHP: "#4F5D95", Vue: "#41B883", HTML: "#E34C26", CSS: "#663399", Ruby: "#701516",
  Python: "#3572A5", Go: "#00ADD8", Dart: "#00B4AB", Swift: "#F05138", Shell: "#89E051",
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : n.toLocaleString("en-US"));

function gradientDefs(id, { x2 = "100%", y2 = "0%" } = {}) {
  const stops = ACCENT.map((c, i) => `<stop offset="${(i / (ACCENT.length - 1)) * 100}%" stop-color="${c}"/>`).join("");
  return `<linearGradient id="${id}" x1="0%" y1="0%" x2="${x2}" y2="${y2}">${stops}</linearGradient>`;
}

// ─── Hero ───────────────────────────────────────────────────────────────────

const ROLES = [
  "full-stack software products",
  "Python & TypeScript backends",
  "AI-powered developer tools",
  "web and mobile apps",
  "products people rely on",
];

// A typewriter built from SMIL: a clip rect whose width steps one character
// at a time, types a word, holds, erases, then hands over to the next word.
function typewriter({ x, y, size, color }) {
  const charW = size * 0.6; // monospace advance width
  const typeStep = 0.06, holdTime = 1.6, eraseStep = 0.03, gap = 0.3;
  const slots = ROLES.map((r) => r.length * typeStep + holdTime + r.length * eraseStep + gap);
  const total = slots.reduce((a, b) => a + b, 0);

  let offset = 0;
  const parts = ROLES.map((role, i) => {
    const n = role.length;
    const frames = [];
    for (let k = 0; k <= n; k++) frames.push([offset + k * typeStep, k]);
    const erased = offset + n * typeStep + holdTime;
    for (let k = n; k >= 0; k--) frames.push([erased + (n - k) * eraseStep, k]);
    offset += slots[i];

    // keyTimes must start at 0 and end at 1.
    const times = [0, ...frames.map(([t]) => t / total), 1];
    const widths = [0, ...frames.map(([, k]) => k * charW), 0];
    const keyTimes = times.map((t) => Math.min(1, t).toFixed(5)).join(";");
    const values = widths.map((w) => w.toFixed(1)).join(";");
    // Cursor rides the end of whatever is visible.
    const cursorX = widths.map((w) => (x + w + 2).toFixed(1)).join(";");

    return {
      clip: `<clipPath id="tw${i}"><rect x="${x}" y="${y - size}" height="${size * 1.4}" width="0">
        <animate attributeName="width" values="${values}" keyTimes="${keyTimes}" dur="${total}s" calcMode="discrete" repeatCount="indefinite"/>
      </rect></clipPath>`,
      text: `<text x="${x}" y="${y}" clip-path="url(#tw${i})" font-family="${MONO}" font-size="${size}" fill="url(#accent)" font-weight="600">${esc(role)}</text>`,
      cursor: `<animate attributeName="x" values="${cursorX}" keyTimes="${keyTimes}" dur="${total}s" calcMode="discrete" repeatCount="indefinite"/>`,
      window: [times[1], times[times.length - 2]],
    };
  });

  // One cursor, moved by whichever word owns the current time slice.
  const cursorKeys = [];
  const cursorVals = [];
  parts.forEach((p, i) => {
    const vals = p.cursor.match(/values="([^"]+)"/)[1].split(";");
    const keys = p.cursor.match(/keyTimes="([^"]+)"/)[1].split(";");
    const start = i === 0 ? 0 : 1;
    for (let k = start; k < keys.length - 1; k++) { cursorKeys.push(keys[k]); cursorVals.push(vals[k]); }
  });
  cursorKeys.push("1"); cursorVals.push(cursorVals[0]);

  return {
    defs: parts.map((p) => p.clip).join(""),
    body: `${parts.map((p) => p.text).join("")}
      <rect x="${x}" y="${y - size * 0.82}" width="${size * 0.55}" height="${size * 1.02}" rx="2" fill="${color}">
        <animate attributeName="x" values="${cursorVals.join(";")}" keyTimes="${cursorKeys.join(";")}" dur="${total}s" calcMode="discrete" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.5;0.5;1" dur="1s" repeatCount="indefinite"/>
      </rect>`,
  };
}

function codeCard(t, { x, y, w, h }) {
  const c = t.code;
  const P = (s) => `<tspan fill="${c.punct}">${esc(s)}</tspan>`;
  const K = (s) => `<tspan fill="${c.key}">${esc(s)}</tspan>`;
  const S = (s) => `<tspan fill="${c.str}">"${esc(s)}"</tspan>`;
  const W = (s) => `<tspan fill="${c.kw}">${esc(s)}</tspan>`;
  const B = (s) => `<tspan fill="${c.bool}">${esc(s)}</tspan>`;
  const arr = (xs) => `${P("[")}${xs.map(S).join(P(", "))}${P("]")}`;

  const lines = [
    `${W("const")} ${K("john")} ${P("=")} ${P("{")}`,
    `  ${K("role")}${P(":")} ${S("Software Engineer")}${P(",")}`,
    `  ${K("now")}${P(":")} ${S("Fullstack Engineer @ Turing")}${P(",")}`,
    `  ${K("languages")}${P(":")} ${arr(["Python", "TypeScript"])}${P(",")}`,
    `  ${K("builds")}${P(":")} ${arr(["backend", "web", "mobile"])}${P(",")}`,
    `  ${K("interests")}${P(":")} ${arr(["AI", "data eng", "ML"])}${P(",")}`,
    `  ${K("shipping")}${P(":")} ${B("true")}${P(",")}`,
    `${P("};")}`,
  ];

  const lh = 26, top = y + 72;
  const body = lines.map((l, i) =>
    `<text x="${x + 50}" y="${top + i * lh}" font-family="${MONO}" font-size="14.5" fill="${t.text}" xml:space="preserve">${l}</text>`
  ).join("");
  const gutter = lines.map((_, i) =>
    `<text x="${x + 32}" y="${top + i * lh}" font-family="${MONO}" font-size="12" fill="${t.faint}" text-anchor="end" opacity="0.7">${i + 1}</text>`
  ).join("");

  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${t.surface}" fill-opacity="0.82" stroke="${t.border}"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="none" stroke="url(#accent)" stroke-opacity="0.35"/>
    <circle cx="${x + 24}" cy="${y + 26}" r="5.5" fill="#FF5F57"/>
    <circle cx="${x + 43}" cy="${y + 26}" r="5.5" fill="#FEBC2E"/>
    <circle cx="${x + 62}" cy="${y + 26}" r="5.5" fill="#28C840"/>
    <text x="${x + w / 2}" y="${y + 30}" font-family="${MONO}" font-size="12" fill="${t.muted}" text-anchor="middle">john.ts</text>
    <line x1="${x}" x2="${x + w}" y1="${y + 46}" y2="${y + 46}" stroke="${t.border}"/>
    ${gutter}
    ${body}
  </g>`;
}

function hero(mode) {
  const t = THEMES[mode];
  const W = 1200, H = 420;
  const prompt = "> building ";
  const tw = typewriter({ x: 64 + prompt.length * 22 * 0.6, y: 312, size: 22, color: ACCENT[1] });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="John Nnamani — Software Engineer">
  <title>John Nnamani — Software Engineer</title>
  <defs>
    ${gradientDefs("accent")}
    <clipPath id="frame"><rect width="${W}" height="${H}" rx="24"/></clipPath>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M40 0H0V40" fill="none" stroke="${t.grid}" stroke-opacity="${t.gridOpacity}"/>
    </pattern>
    <radialGradient id="fade" cx="35%" cy="40%" r="75%">
      <stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <mask id="gridMask"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="70"/></filter>
    ${tw.defs}
  </defs>

  <g clip-path="url(#frame)">
    <rect width="${W}" height="${H}" fill="${t.bg}"/>
    <g filter="url(#blur)" opacity="${t.orbOpacity}">
      <circle cx="180" cy="80" r="170" fill="${ACCENT[0]}">
        <animate attributeName="cx" values="180;260;180" dur="14s" repeatCount="indefinite"/>
        <animate attributeName="cy" values="80;130;80" dur="11s" repeatCount="indefinite"/>
      </circle>
      <circle cx="980" cy="360" r="190" fill="${ACCENT[1]}">
        <animate attributeName="cx" values="980;880;980" dur="16s" repeatCount="indefinite"/>
      </circle>
      <circle cx="640" cy="440" r="140" fill="${ACCENT[2]}" opacity="0.7">
        <animate attributeName="cx" values="560;720;560" dur="18s" repeatCount="indefinite"/>
      </circle>
    </g>
    <rect width="${W}" height="${H}" fill="url(#grid)" mask="url(#gridMask)"/>

    <g>
      <rect x="64" y="64" width="292" height="32" rx="16" fill="${t.surface}" fill-opacity="0.7" stroke="${t.border}"/>
      <circle cx="84" cy="80" r="4.5" fill="#22C55E"><animate attributeName="opacity" values="1;.35;1" dur="2.4s" repeatCount="indefinite"/></circle>
      <text x="98" y="85" font-family="${MONO}" font-size="13" fill="${t.muted}">@kescript · software engineer</text>
    </g>

    <g>
      <text x="60" y="176" font-family="${SANS}" font-size="72" font-weight="800" letter-spacing="-2.5" fill="${t.text}">John</text>
      <text x="60" y="252" font-family="${SANS}" font-size="72" font-weight="800" letter-spacing="-2.5" fill="url(#accent)">Nnamani.</text>
    </g>

    <g>
      <text x="64" y="312" font-family="${MONO}" font-size="22" fill="${t.muted}" xml:space="preserve">${esc(prompt)}</text>
      ${tw.body}
      <text x="64" y="356" font-family="${SANS}" font-size="16" fill="${t.muted}">Software engineer writing Python &amp; TypeScript. Interested in AI, data &amp; ML.</text>
    </g>

    ${codeCard(t, { x: 690, y: 72, w: 450, h: 276 })}
  </g>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="24" fill="none" stroke="${t.border}"/>
</svg>`;
}

// ─── Data ───────────────────────────────────────────────────────────────────

async function gh(path, init = {}) {
  const headers = { "User-Agent": USER, Accept: "application/vnd.github+json" };
  if (TOKEN) headers.Authorization = `bearer ${TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { ...init, headers: { ...headers, ...init.headers } });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchGraphQL() {
  const query = `query($login: String!) {
    user(login: $login) {
      createdAt
      followers { totalCount }
      pullRequests { totalCount }
      repositories(ownerAffiliations: OWNER, isFork: false, first: 100, orderBy: {field: PUSHED_AT, direction: DESC}) {
        totalCount
        nodes { stargazerCount languages(first: 8, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name color } } } }
      }
      contributionsCollection {
        contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
      }
    }
  }`;
  const { data, errors } = await gh("/graphql", { method: "POST", body: JSON.stringify({ query, variables: { login: USER } }) });
  if (errors) throw new Error(JSON.stringify(errors));
  const u = data.user;
  const langs = {};
  for (const r of u.repositories.nodes)
    for (const e of r.languages.edges) {
      langs[e.node.name] ??= { size: 0, color: e.node.color };
      langs[e.node.name].size += e.size;
    }
  return {
    createdAt: u.createdAt,
    followers: u.followers.totalCount,
    prs: u.pullRequests.totalCount,
    repos: u.repositories.totalCount,
    stars: u.repositories.nodes.reduce((a, r) => a + r.stargazerCount, 0),
    contributions: u.contributionsCollection.contributionCalendar.totalContributions,
    days: u.contributionsCollection.contributionCalendar.weeks.flatMap((w) => w.contributionDays)
      .map((d) => ({ date: d.date, count: d.contributionCount })),
    langs: Object.entries(langs).map(([name, v]) => ({ name, value: v.size, color: v.color })),
  };
}

async function fetchPublic() {
  const [user, repos, prs, html] = await Promise.all([
    gh(`/users/${USER}`),
    gh(`/users/${USER}/repos?per_page=100&type=owner`),
    gh(`/search/issues?q=type:pr+author:${USER}&per_page=1`).catch(() => ({ total_count: 0 })),
    fetch(`https://github.com/users/${USER}/contributions`).then((r) => r.text()),
  ]);
  const own = repos.filter((r) => !r.fork);

  // The contributions page pairs each day cell (id + date) with a tooltip.
  const dates = {};
  for (const m of html.matchAll(/data-date="([\d-]+)"[^>]*id="([^"]+)"/g)) dates[m[2]] = m[1];
  const counts = {};
  for (const m of html.matchAll(/<tool-tip[^>]*for="([^"]+)"[^>]*>([^<]*)</g)) {
    const n = /^(\d[\d,]*) contribution/.exec(m[2].trim());
    if (dates[m[1]]) counts[dates[m[1]]] = n ? Number(n[1].replace(/,/g, "")) : 0;
  }
  const days = Object.keys(counts).sort().map((date) => ({ date, count: counts[date] }));

  const langs = {};
  for (const r of own) if (r.language) langs[r.language] = (langs[r.language] || 0) + 1;

  return {
    createdAt: user.created_at,
    followers: user.followers,
    prs: prs.total_count,
    repos: own.length,
    stars: own.reduce((a, r) => a + r.stargazers_count, 0),
    contributions: days.reduce((a, d) => a + d.count, 0),
    days,
    langs: Object.entries(langs).map(([name, value]) => ({ name, value })),
  };
}

function streaks(days) {
  let longest = 0, run = 0;
  for (const d of days) { run = d.count > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  // Today not having a contribution yet shouldn't break the current streak.
  let current = 0, i = days.length - 1;
  if (i >= 0 && days[i].count === 0) i--;
  for (; i >= 0 && days[i].count > 0; i--) current++;
  return { current, longest };
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

function dashboard(mode, s) {
  const t = THEMES[mode];
  const W = 1200, H = 566, PAD = 40;
  const { current, longest } = streaks(s.days);
  const years = Math.floor((Date.now() - new Date(s.createdAt)) / 3.15576e10);

  const tiles = [
    ["Contributions", fmt(s.contributions), "in the last year"],
    ["Current streak", `${current}d`, `longest ${longest} days`],
    ["Pull requests", fmt(s.prs), "opened, all time"],
    ["Repositories", fmt(s.repos), "public, original"],
    ["Stars earned", fmt(s.stars), "across my repos"],
    ["On GitHub", `${years} yrs`, `since ${new Date(s.createdAt).getFullYear()}`],
  ];
  const tw = 196, th = 104, gap = 16, tx0 = PAD, ty0 = 92;
  const tileSvg = tiles.map(([label, value, sub], i) => {
    const x = tx0 + (i % 3) * (tw + gap), y = ty0 + Math.floor(i / 3) * (th + gap);
    return `<g>
      <rect x="${x}" y="${y}" width="${tw}" height="${th}" rx="14" fill="${t.surface2}" stroke="${t.border}"/>
      <text x="${x + 18}" y="${y + 30}" font-family="${SANS}" font-size="13" font-weight="600" fill="${t.muted}">${esc(label)}</text>
      <text x="${x + 18}" y="${y + 70}" font-family="${SANS}" font-size="34" font-weight="800" letter-spacing="-1" fill="${i === 0 ? "url(#accent)" : t.text}">${esc(value)}</text>
      <text x="${x + 18}" y="${y + 91}" font-family="${SANS}" font-size="12" fill="${t.faint}">${esc(sub)}</text>
    </g>`;
  }).join("");

  // Languages: stacked bar + two-column legend.
  const lx = 700, lw = W - PAD - lx;
  const total = s.langs.reduce((a, l) => a + l.value, 0) || 1;
  const top = [...s.langs].sort((a, b) => b.value - a.value).slice(0, 6);
  let cx = lx;
  const bar = top.map((l) => {
    const w = (l.value / total) * lw;
    const seg = `<rect x="${cx.toFixed(1)}" y="128" width="${Math.max(w - 3, 2).toFixed(1)}" height="12" rx="3" fill="${l.color || LANG_COLORS[l.name] || t.faint}"/>`;
    cx += w;
    return seg;
  }).join("");
  const legend = top.map((l, i) => {
    const x = lx + (i % 2) * (lw / 2), y = 182 + Math.floor(i / 2) * 40;
    const pct = ((l.value / total) * 100).toFixed(1);
    return `<g>
      <circle cx="${x + 6}" cy="${y - 5}" r="6" fill="${l.color || LANG_COLORS[l.name] || t.faint}"/>
      <text x="${x + 22}" y="${y}" font-family="${SANS}" font-size="15" font-weight="600" fill="${t.text}">${esc(l.name)}</text>
      <text x="${x + lw / 2 - 24}" y="${y}" font-family="${MONO}" font-size="13" fill="${t.muted}" text-anchor="end">${pct}%</text>
    </g>`;
  }).join("");

  // Heatmap: last 53 weeks, Sunday-aligned like GitHub's.
  const days = s.days.slice(-371);
  const firstDow = days.length ? new Date(days[0].date + "T00:00:00Z").getUTCDay() : 0;
  const active = days.map((d) => d.count).filter((n) => n > 0).sort((a, b) => a - b);
  const q = [0.25, 0.5, 0.75].map((p) => active[Math.floor(p * (active.length - 1))] ?? 1);
  const level = (n) => (n === 0 ? 0 : 1 + q.filter((v) => n > v).length);
  const cell = 17, cg = 4, hx = PAD, hy = 378;
  const heat = days.map((d, i) => {
    const k = i + firstDow;
    const x = hx + Math.floor(k / 7) * (cell + cg), y = hy + (k % 7) * (cell + cg);
    return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="4" fill="${t.heat[level(d.count)]}"><title>${d.count} on ${d.date}</title></rect>`;
  }).join("");
  const legendHeat = t.heat.map((c, i) =>
    `<rect x="${W - PAD - 150 + i * 22}" y="343" width="14" height="14" rx="3" fill="${c}"/>`).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="GitHub stats for ${USER}">
  <title>GitHub stats for ${USER}</title>
  <defs>${gradientDefs("accent", { x2: "100%", y2: "100%" })}</defs>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="24" fill="${t.surface}" stroke="${t.border}"/>
  <rect x="${PAD}" y="0" width="120" height="3" rx="1.5" fill="url(#accent)"/>

  <text x="${PAD}" y="58" font-family="${SANS}" font-size="22" font-weight="800" letter-spacing="-.5" fill="${t.text}">At a glance</text>
  <text x="${W - PAD}" y="58" font-family="${MONO}" font-size="12" fill="${t.faint}" text-anchor="end">auto-refreshed daily</text>

  ${tileSvg}

  <text x="${lx}" y="108" font-family="${SANS}" font-size="13" font-weight="600" fill="${t.muted}">Most used languages</text>
  <rect x="${lx}" y="128" width="${lw}" height="12" rx="3" fill="${t.surface2}"/>
  ${bar}
  ${legend}

  <text x="${PAD}" y="356" font-family="${SANS}" font-size="13" font-weight="600" fill="${t.muted}">Contribution activity · past 12 months</text>
  <g>${heat}</g>
  <text x="${W - PAD - 160}" y="355" font-family="${SANS}" font-size="12" fill="${t.faint}" text-anchor="end">Less</text>
  ${legendHeat}
  <text x="${W - PAD}" y="355" font-family="${SANS}" font-size="12" fill="${t.faint}" text-anchor="end">More</text>
</svg>`;
}

// ─── Snake ──────────────────────────────────────────────────────────────────

// 5×7 pixel glyphs, one string per row. The grid has 7 rows, like GitHub's.
const GLYPHS = {
  K: ["X...X", "X..X.", "X.X..", "XX...", "X.X..", "X..X.", "X...X"],
  E: ["XXXXX", "X....", "X....", "XXXX.", "X....", "X....", "XXXXX"],
  S: [".XXXX", "X....", "X....", ".XXX.", "....X", "....X", "XXXX."],
  C: [".XXXX", "X....", "X....", "X....", "X....", "X....", ".XXXX"],
  R: ["XXXX.", "X...X", "X...X", "XXXX.", "X.X..", "X..X.", "X...X"],
  I: ["XXXXX", "..X..", "..X..", "..X..", "..X..", "..X..", "XXXXX"],
  P: ["XXXX.", "X...X", "X...X", "XXXX.", "X....", "X....", "X...."],
  T: ["XXXXX", "..X..", "..X..", "..X..", "..X..", "..X..", "..X.."],
};

function lerpColor(stops, f) {
  const seg = Math.min(stops.length - 2, Math.floor(f * (stops.length - 1)));
  const local = f * (stops.length - 1) - seg;
  const [a, b] = [stops[seg], stops[seg + 1]].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * local).toString(16).padStart(2, "0")).join("")}`;
}

// The snake slithers down and up each column in turn; every letter cell its
// head passes lights up, so the word is written behind it. Then it fades and loops.
function snake(mode, word = "KESCRIPT") {
  const t = THEMES[mode];
  const COLS = 53, ROWS = 7, cell = 16, gap = 4, PAD = 8, step = cell + gap;
  const W = PAD * 2 + COLS * step - gap, H = PAD * 2 + ROWS * step - gap;
  const LEN = 6, dt = 0.032, hold = 3, fade = 0.6;

  const lit = new Set();
  const wordCols = word.length * 6 - 1;
  const c0 = Math.floor((COLS - wordCols) / 2);
  [...word].forEach((ch, li) => GLYPHS[ch].forEach((row, r) =>
    [...row].forEach((px, c) => px === "X" && lit.add(`${c0 + li * 6 + c},${r}`))));

  // Path: enter from the left, serpentine through every column, exit right.
  const path = [];
  for (let k = LEN; k > 0; k--) path.push([-k, 0]);
  for (let c = 0; c < COLS; c++)
    for (let i = 0; i < ROWS; i++) path.push([c, c % 2 ? ROWS - 1 - i : i]);
  const [lc, lr] = path[path.length - 1];
  for (let k = 1; k <= LEN; k++) path.push([lc + k, lr]);

  const S = path.length - 1;
  const D = S * dt + hold;
  const kt = (sec) => (sec / D).toFixed(5);
  const px = (c) => PAD + c * step, py = (r) => PAD + r * step;

  const grid = [];
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r < ROWS; r++)
      grid.push(`<rect x="${px(c)}" y="${py(r)}" width="${cell}" height="${cell}" rx="4" fill="${t.heat[0]}"/>`);

  const letters = path.map(([c, r], s) => {
    if (!lit.has(`${c},${r}`)) return "";
    const on = s * dt;
    const times = [0, on, on + 0.2, D - fade - 0.1, D - 0.1, D].map(kt).join(";");
    const fill = lerpColor(ACCENT, (c - c0) / (wordCols - 1));
    return `<rect x="${px(c)}" y="${py(r)}" width="${cell}" height="${cell}" rx="4" fill="${fill}" opacity="0">
      <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="${times}" dur="${D}s" repeatCount="indefinite"/>
    </rect>`;
  }).join("");

  const keyTimes = [...path.map((_, s) => kt(s * dt)), "1"].join(";");
  const body = Array.from({ length: LEN }, (_, k) => {
    const size = cell - k * 1.2, off = (cell - size) / 2;
    const at = (s) => path[Math.max(0, s - k)];
    const xs = [...path.map((_, s) => px(at(s)[0]) + off), px(path[S - k][0]) + off].map((v) => v.toFixed(1)).join(";");
    const ys = [...path.map((_, s) => py(at(s)[1]) + off), py(path[S - k][1]) + off].map((v) => v.toFixed(1)).join(";");
    return `<rect width="${size.toFixed(1)}" height="${size.toFixed(1)}" rx="${(size / 3).toFixed(1)}" fill="${t.text}">
      <animate attributeName="x" values="${xs}" keyTimes="${keyTimes}" dur="${D}s" repeatCount="indefinite"/>
      <animate attributeName="y" values="${ys}" keyTimes="${keyTimes}" dur="${D}s" repeatCount="indefinite"/>
    </rect>`;
  }).reverse().join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="A snake writing ${word} across a contribution grid">
  <title>A snake writing ${word} across a contribution grid</title>
  <defs><clipPath id="board"><rect x="${PAD}" y="${PAD}" width="${W - PAD * 2}" height="${H - PAD * 2}"/></clipPath></defs>
  <g>${grid.join("")}</g>
  <g>${letters}</g>
  <g clip-path="url(#board)">${body}</g>
</svg>`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

const stats = TOKEN ? await fetchGraphQL() : await fetchPublic();
await mkdir(OUT, { recursive: true });
for (const mode of Object.keys(THEMES)) {
  await writeFile(new URL(`hero-${mode}.svg`, OUT), hero(mode));
  await writeFile(new URL(`stats-${mode}.svg`, OUT), dashboard(mode, stats));
  await writeFile(new URL(`snake-${mode}.svg`, OUT), snake(mode));
}
console.log(`Built assets for ${USER}: ${stats.contributions} contributions, ${stats.repos} repos, ${stats.langs.length} languages.`);
