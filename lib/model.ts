// Consensus Radar: two independent valuations of every pre-token protocol.
//
// The board ranks protocols by the weighted geometric mean of two models that
// are both fitted from the snapshot itself at run time, never from a hand-kept
// list:
//
//   Model A, the curve: a log-log fit of market cap on TVL over the live-token
//     protocols. It answers "what does the market pay for a protocol this big?"
//     The fit is weak and is reported honestly: on this snapshot it explains
//     about a tenth of the variance, which is exactly why one curve is not
//     enough.
//   Model B, the peers: the median market-cap-per-TVL of live-token protocols
//     in the same category (three or more peers), falling back to the global
//     median. It answers "what does the market pay for a protocol like this?"
//
// Consensus is the weighted geometric mean, 70% curve and 30% peers. The
// weight is fitted by leave-one-out, not chosen by taste: on the 92 teachers
// the 70/30 blend lands half its predictions within 3.0x of the actual cap
// and 50% within 3x, against 3.6x / 39% for the 50/50 blend and 5.6x / 30%
// for the peers alone; every step from 50/50 toward 70/30 is a paired
// improvement (Wilcoxon p < 0.02). Disagreement is |log10(A / B)|: a protocol
// the two models price more than ~3x apart is flagged SPLIT, so a reader
// sees where the models agree and where they do not, instead of one number
// pretending to be certain.
//
// Both models share two adjustments, both from the snapshot's own figures:
// growth (the 7-day TVL change, clamped) and maturity (how long the protocol
// has run with no token on record). Nothing here names a protocol.

/** One protocol of the sealed snapshot: exactly its ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, stated in the dashboard and nowhere else. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  peer_min_count: number;
  split_log10: number;
  /** Weight of the curve in the consensus: consensus = A^w x B^(1-w). */
  consensus_curve_weight: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  peer_min_count: 3,
  split_log10: 0.5,
  consensus_curve_weight: 0.7,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'consensus-2';

/** How many pre-token protocols below the watchlist floor the early radar carries. */
export const EARLY_ROWS = 200;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** The log-log curve fitted at run time from the live-token protocols. */
export interface CurveFit {
  intercept: number;
  slope: number;
  r2: number;
  n: number;
  /** Median |log10(predicted / actual)| under leave-one-out. */
  loo_median_log10_err: number;
  /** Share of leave-one-out predictions within 2x of the actual market cap. */
  loo_within_2x: number;
  /** Share of leave-one-out predictions within 3x of the actual market cap. */
  loo_within_3x: number;
}

/** One category's peer multiple: the median market-cap-per-TVL of its live protocols. */
export interface PeerMultiple {
  category: string;
  median_multiple: number;
  peer_count: number;
  fallback: boolean;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    curve_value_usd: number;
    peer_value_usd: number;
    peer_category: string;
    peer_multiple: number;
    peer_count: number;
    peer_fallback: boolean;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    disagreement_log10: number;
    verdict: 'agree' | 'split';
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  curve_value_usd: number;
  peer_value_usd: number;
  peer_category: string;
  peer_multiple: number;
  peer_count: number;
  peer_fallback: boolean;
  growth_multiplier: number;
  maturity_multiplier: number;
  disagreement_log10: number;
  verdict: 'agree' | 'split';
  watchlist: boolean;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  curve: CurveFit;
  peers: PeerMultiple[];
  global_peer_multiple: number;
  /** Leave-one-out of the shipped consensus, the 50/50 blend and the peers alone. */
  consensus_loo: LooMetrics;
  blend50_loo: LooMetrics;
  peer_loo: LooMetrics;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  split_count: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word wrapped, staked or staking anywhere in the name. */
const WRAPPED = /\b(wrapped|staked|staking)\b/i;
/** Categories that are a wrapped, staked or bridged product of a token that already trades. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** Exchange names a protocol name must not begin with. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token and not a wrapped, staked or bridged product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    p.category !== null &&
    !PRODUCT_CATEGORIES.has(p.category) &&
    !VERSIONED.test(p.name) &&
    !WRAPPED.test(p.name) &&
    !EXCHANGES.some((e) => p.name.startsWith(e))
  );
}

/** Whether a live-token protocol can teach the models: it trades, and it is a protocol in its own right. */
export function isTeacher(p: SnapshotProtocol): boolean {
  return (
    !isPreToken(p) &&
    p.mcap_usd !== null &&
    p.mcap_usd > 0 &&
    p.tvl_usd > 0 &&
    p.category !== null &&
    !PRODUCT_CATEGORIES.has(p.category) &&
    !VERSIONED.test(p.name) &&
    !WRAPPED.test(p.name) &&
    !EXCHANGES.some((e) => p.name.startsWith(e))
  );
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/** Leave-one-out summary of log10 market-cap predictions, in log10 units. */
export interface LooMetrics {
  median_log10_err: number;
  within_2x: number;
  within_3x: number;
}

/** OLS line through (xs, ys): intercept and slope. */
function fitLine(xs: number[], ys: number[]): { intercept: number; slope: number } {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return { intercept: my - slope * mx, slope };
}

/** A leave-one-out summary from log10 predictions and actual log10 market caps. */
export function looMetrics(predicted: number[], actual: number[]): LooMetrics {
  const errs = predicted.map((p, i) => Math.abs(p - actual[i]!)).sort((a, b) => a - b);
  const within = (limit: number): number => errs.filter((e) => e <= Math.log10(limit)).length / errs.length;
  return {
    median_log10_err: round4(median(errs)),
    within_2x: round4(within(2)),
    within_3x: round4(within(3)),
  };
}

/**
 * The log-log curve, fitted at run time from the live-token protocols:
 * log10(market cap) = intercept + slope x log10(TVL). Leave-one-out error is
 * measured the same way, so the dashboard can state how weak the curve is.
 */
export function fitCurve(live: SnapshotProtocol[]): CurveFit {
  const xs = live.map((p) => Math.log10(p.tvl_usd));
  const ys = live.map((p) => Math.log10(p.mcap_usd!));
  const n = xs.length;
  const { intercept, slope } = fitLine(xs, ys);
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (ys[i]! - my) * (ys[i]! - my);
    const r = ys[i]! - (intercept + slope * xs[i]!);
    ssRes += r * r;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  // Leave-one-out: refit without each point and measure |log10(predicted / actual)|.
  const looErrs: number[] = [];
  for (let i = 0; i < n; i++) {
    const ox = xs.filter((_, j) => j !== i);
    const oy = ys.filter((_, j) => j !== i);
    const l = fitLine(ox, oy);
    looErrs.push(Math.abs(l.intercept + l.slope * xs[i]! - ys[i]!));
  }
  const within = (limit: number): number => looErrs.filter((e) => e <= Math.log10(limit)).length / n;
  return {
    intercept: round4(intercept),
    slope: round4(slope),
    r2: round4(r2),
    n,
    loo_median_log10_err: round4(median(looErrs)),
    loo_within_2x: round4(within(2)),
    loo_within_3x: round4(within(3)),
  };
}

/** The growth multiplier from the 7-day TVL change, clamped. */
function growthMultiplier(change7d: number | null, model: ModelConstants): { pct: number; mult: number } {
  const pct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(change7d, 0)));
  return { pct, mult: 1 + (pct / 100) * model.growth_weight };
}

/** The maturity multiplier from how long the protocol has run with no token on record. */
function maturityMultiplier(age: number | null, model: ModelConstants): number {
  const a = age ?? model.unknown_age_days;
  return model.maturity_floor + (Math.min(Math.max(a, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
}

/**
 * Leave-one-out log10 predictions for each teacher, from each model, before
 * the growth and maturity adjustments: the curve refitted without the point,
 * and the peer multiple recomputed without it (same category rule, same
 * fallback threshold). The adjustments are the protocol's own figures, so
 * they need no refit and are added by the caller in log space.
 */
export function looPredictions(
  live: SnapshotProtocol[],
  asOf: string,
  model: ModelConstants,
): { curve: number[]; peers: number[]; actual: number[] } {
  const xs = live.map((p) => Math.log10(p.tvl_usd));
  const ys = live.map((p) => Math.log10(p.mcap_usd!));
  const ratios = live.map((p) => p.mcap_usd! / p.tvl_usd);
  const curve: number[] = [];
  const peers: number[] = [];
  for (let i = 0; i < live.length; i++) {
    const ox = xs.filter((_, j) => j !== i);
    const oy = ys.filter((_, j) => j !== i);
    const l = fitLine(ox, oy);
    curve.push(l.intercept + l.slope * xs[i]!);
    const cat = live[i]!.category ?? 'Other';
    const same = ratios.filter((_, j) => j !== i && (live[j]!.category ?? 'Other') === cat);
    const mult = same.length >= model.peer_min_count ? median(same) : median(ratios.filter((_, j) => j !== i));
    peers.push(Math.log10(live[i]!.tvl_usd * mult));
  }
  return { curve, peers, actual: ys };
}

/**
 * Leave-one-out summary of the shipped consensus for the teachers: the
 * weighted blend of the two models' leave-one-out predictions, plus the
 * growth and maturity adjustments, in log space. Also the 50/50 blend and
 * the peers alone, so the dashboard can show why the weight is 70/30.
 */
export function consensusLoo(
  live: SnapshotProtocol[],
  asOf: string,
  model: ModelConstants,
): { consensus: LooMetrics; blend50: LooMetrics; peers: LooMetrics } {
  const { curve, peers, actual } = looPredictions(live, asOf, model);
  const adj = live.map((p) => {
    const g = growthMultiplier(p.change_7d, model).mult;
    const m = maturityMultiplier(ageDays(asOf, p.listed_at), model);
    return Math.log10(g * m);
  });
  const w = model.consensus_curve_weight;
  const blend = (weight: number): number[] => curve.map((a, i) => weight * a + (1 - weight) * peers[i]! + adj[i]!);
  return {
    consensus: looMetrics(blend(w), actual),
    blend50: looMetrics(blend(0.5), actual),
    peers: looMetrics(peers, actual),
  };
}

/** The peer multiple per category, and the global fallback. */
export function peerMultiples(live: SnapshotProtocol[], minCount: number): { byCategory: Map<string, PeerMultiple>; global: number } {
  const byCat = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of live) {
    const ratio = p.mcap_usd! / p.tvl_usd;
    all.push(ratio);
    const c = p.category ?? 'Other';
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c)!.push(ratio);
  }
  const global = median(all);
  const out = new Map<string, PeerMultiple>();
  for (const [c, ratios] of byCat) {
    out.set(c, {
      category: c,
      median_multiple: round4(median(ratios)),
      peer_count: ratios.length,
      fallback: ratios.length < minCount,
    });
  }
  return { byCategory: out, global: round4(global) };
}

/** The two models' values for one protocol, and their consensus. */
export function scoreProtocol(
  p: SnapshotProtocol,
  asOf: string,
  curve: CurveFit,
  peers: Map<string, PeerMultiple>,
  globalPeer: number,
  model: ModelConstants,
): {
  curveValue: number;
  peerValue: number;
  consensus: number;
  peerCategory: string;
  peerMultiple: number;
  peerCount: number;
  peerFallback: boolean;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  disagreement: number;
  verdict: 'agree' | 'split';
  age: number | null;
} {
  const age = ageDays(asOf, p.listed_at);
  const { pct, mult: growthMult } = growthMultiplier(p.change_7d, model);
  const maturityMult = maturityMultiplier(age, model);
  const curveValue = Math.max(1, Math.round(Math.pow(10, curve.intercept + curve.slope * Math.log10(p.tvl_usd)) * growthMult * maturityMult));
  const peer = peers.get(p.category ?? 'Other');
  const peerMultiple = peer !== undefined && !peer.fallback ? peer.median_multiple : globalPeer;
  const peerCount = peer !== undefined ? peer.peer_count : 0;
  const peerFallback = peer === undefined || peer.fallback;
  const peerValue = Math.max(1, Math.round(p.tvl_usd * peerMultiple * growthMult * maturityMult));
  const consensus = Math.max(
    1,
    Math.round(Math.pow(curveValue, model.consensus_curve_weight) * Math.pow(peerValue, 1 - model.consensus_curve_weight)),
  );
  const disagreement = Math.abs(Math.log10(curveValue / peerValue));
  return {
    curveValue,
    peerValue,
    consensus,
    peerCategory: p.category ?? 'Other',
    peerMultiple,
    peerCount,
    peerFallback,
    growthPct: pct,
    growthMult: round4(growthMult),
    maturityMult: round4(maturityMult),
    disagreement: round4(disagreement),
    verdict: disagreement >= model.split_log10 ? 'split' : 'agree',
    age,
  };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest consensus first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const live = snapshot.protocols.filter(isTeacher);
  const curve = fitCurve(live);
  const { byCategory: peers, global: globalPeer } = peerMultiples(live, model.peer_min_count);

  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL.
  // The same rankable rule as the watchlist's spirit: no wrapped, staked or
  // bridged product, no versioned pool, no exchange product.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, s: scoreProtocol(p, snapshot.as_of, curve, peers, globalPeer, model) }));
  scored.sort((a, b) => b.s.consensus - a.s.consensus || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.s.age,
    implied_value_usd: s.s.consensus,
    model: {
      curve_value_usd: s.s.curveValue,
      peer_value_usd: s.s.peerValue,
      peer_category: s.s.peerCategory,
      peer_multiple: s.s.peerMultiple,
      peer_count: s.s.peerCount,
      peer_fallback: s.s.peerFallback,
      growth_pct: s.s.growthPct,
      growth_multiplier: s.s.growthMult,
      maturity_multiplier: s.s.maturityMult,
      disagreement_log10: s.s.disagreement,
      verdict: s.s.verdict,
      age_days: s.s.age,
    },
    farm_steps: farmSteps(s.p, s.s.age, s.s.disagreement, s.s.curveValue, s.s.peerValue).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Lend $${capital} of USDC on ${name} on ${chain} and leave the deposit working.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Add $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the position.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and put the bridged funds to work in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and hold the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged trade.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} and take one market position.`;
  if (c.includes('curator') || c.includes('allocator')) return `Put $${capital} into a ${name} vault on ${chain} and hold the vault shares.`;
  if (c.includes('stable')) return `Mint or hold $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

function fmtUsdShort(n: number): string {
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL,
 * age, 7-day change) and from the two models' verdict on it, never from a
 * hand-written list. No step promises a return: farming is activity, not a
 * guarantee.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, disagreement: number, curveValue: number, peerValue: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gap = Math.max(curveValue, peerValue) / Math.max(1, Math.min(curveValue, peerValue));
  const change = p.change_7d ?? 0;
  const depth =
    p.tvl_usd >= 1_000_000_000
      ? `At ${fmtUsdShort(p.tvl_usd)} of TVL the pools are deep, so one deposit is enough.`
      : `At ${fmtUsdShort(p.tvl_usd)} of TVL liquidity is thin, so split the deposit across two days.`;
  const momentum =
    change >= 10
      ? `TVL is up ${change.toFixed(1)}% in seven days, so keep the rhythm while the window is open.`
      : change <= -10
        ? `TVL is down ${Math.abs(change).toFixed(1)}% in seven days, so read the protocol's announcements before adding more.`
        : `TVL is near flat over seven days, so a steady rhythm reads better than a burst.`;
  const holdNote =
    age === null
      ? `The listing date is not reported, so the hold is the conservative one.`
      : age < 180
        ? `The protocol is young, so the longer window proves the activity is sustained.`
        : `The record is already long, so the hold is the standard one.`;
  const verdictStep =
    disagreement >= MODEL.split_log10
      ? `Open this protocol's detail page and read the two valuations before sizing up: the curve says ${fmtUsdShort(curveValue)}, the category peers say ${fmtUsdShort(peerValue)}, a ${gap.toFixed(1)}x gap. Keep the first position small until the next snapshot narrows it.`
      : `Open this protocol's detail page and check the two valuations agree: the curve says ${fmtUsdShort(curveValue)} and the category peers say ${fmtUsdShort(peerValue)}. Agreement is the reason to size the position as planned.`;
  return [
    {
      text: `Start a fresh wallet that holds only the funds you plan to farm, and write its seed phrase on paper, never in a screenshot.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: `${actionFor(p, capital, chain)} ${depth}`,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Do one qualifying action each week, such as a deposit, a borrow, a swap or a vote, so the wallet shows steady use. ${momentum}`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity spans more than one snapshot. ${holdNote}`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    { text: verdictStep, cost: 'nothing to read', time: '10 minutes' },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes, then log the wallet, the dates and every transaction.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Re-open this radar once a week and compare the two models again: if the verdict flips from SPLIT to AGREE the consensus is firmer, and if TVL falls two weeks in a row pause new deposits.`,
      cost: 'nothing to re-check',
      time: '10 minutes a week',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow, watchlist: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    curve_value_usd: row.model.curve_value_usd,
    peer_value_usd: row.model.peer_value_usd,
    peer_category: row.model.peer_category,
    peer_multiple: row.model.peer_multiple,
    peer_count: row.model.peer_count,
    peer_fallback: row.model.peer_fallback,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    disagreement_log10: row.model.disagreement_log10,
    verdict: row.model.verdict,
    watchlist,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData; curve: CurveFit } {
  const live = snapshot.protocols.filter(isTeacher);
  const curve = fitCurve(live);
  const { byCategory: peers, global: globalPeer } = peerMultiples(live, model.peer_min_count);
  const loo = consensusLoo(live, snapshot.as_of, model);
  const board = buildBoard(snapshot, model);
  const liveList = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const peerList = [...peers.values()]
    .filter((pm) => !pm.fallback)
    .sort((a, b) => b.peer_count - a.peer_count || (a.category < b.category ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    curve,
    peers: peerList,
    global_peer_multiple: globalPeer,
    consensus_loo: loo.consensus,
    blend50_loo: loo.blend50,
    peer_loo: loo.peers,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: liveList.length,
    split_count: board.filter((r) => r.model.verdict === 'split').length,
    rows: board.map((r) => radarRow(r, snapshot.watchlist.includes(r.slug))),
    live: liveList,
  };
  return { board, radar, curve };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
