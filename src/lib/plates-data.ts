// 车牌字母编号探索页（/plates/）的数据整理层。
//
// 输入：source/_data/plates.yml。
//   - regions / special / rules：以 GA 36-2018 附录 A 表 A.1 为基准；
//   - updates：2018 年标准实施后已公开的代号增减（郑州豫 V、苏州苏 U 等）；
//   - stories：字母背后的历史（云南无 B、佛山三牌……）。
// 职责：把（code, place）对照整理成页面可直接渲染的结构，补出 A–Z 字母带，
//   并统一计数。页面、资料库计数、测试都引用同一结果，不各自重算。
//
// 缺口约定：I 从不作为发牌机关代号，O 留给公安专段，二者不计入「字母空缺」，
//   在字母带上标为「通用特殊位」而不是「空缺」——否则每个省都会凭空多出两个洞。

export interface PlatesAllocation {
  code: string;
  place: string;
  // 原标准之外、2018 年后启用的代号带启用日期（如 2020-09-16 的豫 V）
  since?: string;
}

export interface PlatesRegion {
  key: string;
  name: string;
  abbr: string;
  kind: 'municipality' | 'province' | 'autonomous-region';
  codesFull: boolean;
  allocations: PlatesAllocation[];
  // 派生：该省用到的、去重后的发牌机关代号（按字母顺序）
  usedCodes: string[];
  // 派生：A–Z 26 个字母的逐位状态
  band: PlatesBandCell[];
  // 派生：多字母城市（place 出现 >1 次）
  multiLetterPlaces: { place: string; codes: string[] }[];
  // 派生：共用代号（code 出现 >1 次，当前数据为空）
  sharedCodes: { code: string; places: string[] }[];
  // 派生：字母空缺（不含 I / O）
  gaps: string[];
}

export interface PlatesBandCell {
  letter: string;
  // used = 有普通分配；empty = 真空缺；special = I / O 这类通用特殊位
  state: 'used' | 'special' | 'empty';
  places: string[];
}

export interface PlatesSpecial {
  code: string;
  meaning: string;
  note: string;
}

export interface PlatesRule {
  key: string;
  title: string;
  text: string;
  source: string;
}

export interface PlatesUpdate {
  date: string;
  place: string;
  change: string;
  reason: string;
  source: string;
}

export interface PlatesStory {
  key: string;
  badge: string;
  title: string;
  body: string;
  source: string;
}

// 跨省聚合出的「反常现象」——用于统计与索引提示。
export interface PlatesMultiLetter {
  region: PlatesRegion;
  place: string;
  codes: string[];
}

export interface PlatesSharedCode {
  region: PlatesRegion;
  code: string;
  places: string[];
}

export interface PlatesAnomalies {
  noBRegions: PlatesRegion[];
  tripleLetterPlaces: PlatesMultiLetter[];
  doubleLetterPlaces: PlatesMultiLetter[];
  sharedCodes: PlatesSharedCode[];
  fullAlphabetRegions: PlatesRegion[];
  toZRegions: PlatesRegion[];
}

export interface PlatesOverview {
  meta: {
    updated: string;
    standard: string;
    standardScope: string;
    lede: string;
    scopeNote: string;
  };
  regions: PlatesRegion[];
  special: PlatesSpecial[];
  rules: PlatesRule[];
  updates: PlatesUpdate[];
  stories: PlatesStory[];
  anomalies: PlatesAnomalies;
  stats: {
    regionCount: number;
    municipalityCount: number;
    allocationCount: number;
    multiLetterPlaceCount: number;
    post2018Count: number;
  };
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const NEVER_ASSIGNED = new Set(['I', 'O']);

function kindLabel(kind: PlatesRegion['kind']): string {
  if (kind === 'municipality') return '直辖市';
  if (kind === 'autonomous-region') return '自治区';
  return '省';
}

function buildRegion(raw: any): PlatesRegion | null {
  if (!raw || typeof raw !== 'object') return null;
  const key = raw.key;
  const name = raw.name;
  const abbr = raw.abbr;
  const kind = raw.kind;
  if (!key || !name || !abbr || !kind) return null;

  const isMunicipality = kind === 'municipality';
  const codesFull = isMunicipality || raw.codes === 'full';
  const allocations: PlatesAllocation[] = codesFull
    ? []
    : (Array.isArray(raw.allocations) ? raw.allocations : [])
        .filter(
          (a: any) =>
            a &&
            typeof a.code === 'string' &&
            a.code.length === 1 &&
            typeof a.place === 'string' &&
            a.place.length > 0
        )
        .map((a: any) => {
          const item: PlatesAllocation = { code: a.code.toUpperCase(), place: a.place };
          if (typeof a.since === 'string' && a.since) item.since = a.since;
          return item;
        });

  const usedSet = new Set<string>();
  const codePlaces = new Map<string, string[]>();
  const placeCodes = new Map<string, string[]>();

  if (codesFull) {
    ALPHABET.forEach((l) => usedSet.add(l));
  } else {
    allocations.forEach((a) => {
      usedSet.add(a.code);
      const cur = codePlaces.get(a.code) || [];
      cur.push(a.place);
      codePlaces.set(a.code, cur);
      const pc = placeCodes.get(a.place) || [];
      pc.push(a.code);
      placeCodes.set(a.place, pc);
    });
  }

  const usedCodes = Array.from(usedSet).sort();

  // A–Z 字母带：used = 有普通分配；special = I / O 通用特殊位；empty = 真空缺
  const band: PlatesBandCell[] = ALPHABET.map((letter) => {
    // I / O 即使直辖市也不作为普通发牌代号，统一标为通用特殊位
    if (NEVER_ASSIGNED.has(letter) && !codePlaces.has(letter)) {
      return { letter, state: 'special' as const, places: [] };
    }
    if (codesFull) {
      return { letter, state: 'used' as const, places: [] };
    }
    if (usedSet.has(letter)) {
      return { letter, state: 'used' as const, places: codePlaces.get(letter) || [] };
    }
    return { letter, state: 'empty' as const, places: [] };
  });

  const multiLetterPlaces = Array.from(placeCodes.entries())
    .filter(([, codes]) => codes.length > 1)
    .map(([place, codes]) => ({ place, codes: codes.sort() }))
    .sort((a, b) => a.place.localeCompare(b.place, 'zh'));

  const sharedCodes = Array.from(codePlaces.entries())
    .filter(([, places]) => places.length > 1)
    .map(([code, places]) => ({ code, places }))
    .sort((a, b) => a.code.localeCompare(b.code));

  // 字母空缺：A 到最大已用字母之间、标准里没有出现、且不属于通用特殊位的字母
  const gaps: string[] = [];
  if (!codesFull && usedCodes.length > 0) {
    const first = ALPHABET.indexOf(usedCodes[0]);
    const last = ALPHABET.indexOf(usedCodes[usedCodes.length - 1]);
    for (let i = first; i <= last; i += 1) {
      const letter = ALPHABET[i];
      if (NEVER_ASSIGNED.has(letter)) continue;
      if (!usedSet.has(letter)) gaps.push(letter);
    }
  }

  return {
    key,
    name,
    abbr,
    kind,
    codesFull,
    allocations,
    usedCodes,
    band,
    multiLetterPlaces,
    sharedCodes,
    gaps
  };
}

export function buildPlates(raw: any): PlatesOverview | null {
  const data = raw || {};
  const list = Array.isArray(data.regions) ? data.regions : [];
  if (!list.length) return null;

  const regions: PlatesRegion[] = [];
  for (const r of list) {
    const region = buildRegion(r);
    if (region) regions.push(region);
  }

  const municipalities = regions.filter((r) => r.kind === 'municipality');
  const others = regions.filter((r) => r.kind !== 'municipality');
  const ordered = [...municipalities, ...others];

  const allocationCount = ordered.reduce((n, r) => n + (r.codesFull ? 26 : r.allocations.length), 0);
  const multiLetterPlaceCount = ordered.reduce((n, r) => n + r.multiLetterPlaces.length, 0);
  const post2018Count = ordered.reduce(
    (n, r) => n + r.allocations.filter((a) => !!a.since).length,
    0
  );

  const meta = (data.meta || {}) as PlatesOverview['meta'];
  const special: PlatesSpecial[] = Array.isArray(data.special)
    ? data.special.filter((s: any) => s && s.code && s.meaning)
    : [];
  const rules: PlatesRule[] = Array.isArray(data.rules)
    ? data.rules.filter((r: any) => r && r.key && r.title && r.text)
    : [];
  const updates: PlatesUpdate[] = Array.isArray(data.updates)
    ? data.updates.filter((u: any) => u && u.date && u.place && u.change)
    : [];
  const stories: PlatesStory[] = Array.isArray(data.stories)
    ? data.stories.filter((s: any) => s && s.key && s.title && s.body)
    : [];

  const anomalies: PlatesAnomalies = {
    noBRegions: ordered.filter((r) => r.gaps.includes('B')),
    tripleLetterPlaces: [],
    doubleLetterPlaces: [],
    sharedCodes: [],
    fullAlphabetRegions: ordered.filter((r) => r.codesFull),
    toZRegions: ordered.filter((r) => !r.codesFull && r.usedCodes.includes('Z'))
  };
  for (const r of ordered) {
    for (const m of r.multiLetterPlaces) {
      if (m.codes.length >= 3) anomalies.tripleLetterPlaces.push({ region: r, place: m.place, codes: m.codes });
      else if (m.codes.length === 2) anomalies.doubleLetterPlaces.push({ region: r, place: m.place, codes: m.codes });
    }
    for (const s of r.sharedCodes) {
      anomalies.sharedCodes.push({ region: r, code: s.code, places: s.places });
    }
  }

  return {
    meta,
    regions: ordered,
    special,
    rules,
    updates,
    stories,
    anomalies,
    stats: {
      regionCount: ordered.length,
      municipalityCount: municipalities.length,
      allocationCount,
      multiLetterPlaceCount,
      post2018Count
    }
  };
}

export { kindLabel, ALPHABET };
