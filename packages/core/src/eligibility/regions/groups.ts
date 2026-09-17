// Region groupings job posts use ("EU", "Europe", "EMEA", "CIS", "LATAM"...) with an explicit,
// sourced membership decision per country. Isomorphic.
//
// Membership never makes a job green by itself. `regionContains` returns a confidence so the engine
// can downgrade: a post that says "Europe" is not proof it hires in Moldova.
//
// Confidence:
// - `certain`: an official or standard definition settles it, and employers use the word that way.
// - `likely`: a standard definition settles it, but employers using the word often mean something
//   narrower (their entity countries) or wider. Treat as "probably", never as proof.
// - `ambiguous`: definitions disagree, the country is transcontinental, it is leaving the group,
//   or sanctions make the colloquial meaning differ. Treat as unknown.
//
// Sources (all accessed 2026-09-17):
// [EU]   EU member states: https://european-union.europa.eu/principles-countries-history/eu-countries_en
// [CAND] EU candidate countries and potential candidates (Albania, Bosnia and Herzegovina, Georgia,
//        Kosovo, Moldova, Montenegro, North Macedonia, Serbia, Türkiye, Ukraine; none are members):
//        https://enlargement.ec.europa.eu/enlargement-policy/candidate-countries-and-potential-candidates_en
// [EFTA] EFTA members and EEA EFTA states: https://www.efta.int/ ("Iceland, Liechtenstein, Norway and
//        Switzerland"; EEA brings together EU states and "Iceland, Liechtenstein and Norway")
// [SCH]  Schengen area (29 countries; Bulgaria and Romania from 2025-01-01; Cyprus "not yet" lifted
//        internal border controls; Ireland opts out):
//        https://home-affairs.ec.europa.eu/policies/schengen/schengen-area_en
// [M49]  UN M49 geographic regions: https://unstats.un.org/unsd/methodology/m49/ (Moldova and Ukraine
//        in Eastern Europe; Albania, Bosnia and Herzegovina, Montenegro, North Macedonia, Serbia in
//        Southern Europe; Armenia, Azerbaijan, Georgia, Cyprus, Türkiye in Western Asia; Kosovo not
//        listed; Mexico in Central America).
// [CIS]  CIS participant states per the CIS executive committee portal: https://e-cis.info/cooperation/3009/
//        Georgia's withdrawal completed 2009-08-18 [secondary]:
//        https://www.rferl.org/a/Georgia_Finalizes_Withdrawal_From_CIS/1802284.html
//        Ukraine never ratified the CIS Charter and withdrew its representatives from all CIS
//        bodies in 2018 [secondary]: https://euromaidanpress.com/2020/07/29/ukraine-cuts-more-of-last-remaining-links-with-post-soviet-commonwealth-of-independent-states-cis/
//        Moldova's parliament denounced the CIS founding agreement, protocol and charter on
//        2026-04-02 (Moldpres, state news agency): https://www.moldpres.md/eng/politics/parliament-votes-for-moldova-s-final-withdrawal-from-the-cis
//        and withdrawal takes effect 2027-04-08, 12 months after notification [secondary]:
//        https://logos-pres.md/en/news/moldova-will-officially-leave-the-cis-on-april-8-2027/
// [WB]   Western Balkans partners (Albania, Bosnia and Herzegovina, Kosovo, Montenegro, North
//        Macedonia, Serbia): https://www.eeas.europa.eu/eeas/western-balkans_en
// [RCC]  South-East Europe participants of the Regional Cooperation Council, including Moldova:
//        https://www.rcc.int/pages/96/participants
// [OECD] "Central and Eastern European Countries (CEECs)": Albania, Bulgaria, Croatia, Czech
//        Republic, Hungary, Poland, Romania, Slovak Republic, Slovenia, Estonia, Latvia, Lithuania.
//        https://stats.oecd.org/glossary/detail.asp?ID=303 (fetch failed on 2026-09-17 with a
//        connection reset; list from the OECD glossary as widely cited, UNVERIFIED this session).
// [INF]  No official definition exists (EMEA, APAC, LATAM, MENA, DACH, Balkans, CEE as used by
//        employers). Membership is Pemby's inference from the M49 building blocks, marked as such.

import type { CountryCode } from "./countries";

export const REGION_CODES = [
  "EU",
  "EEA",
  "EFTA",
  "SCHENGEN",
  "EUROPE",
  "EASTERN_EUROPE",
  "WESTERN_EUROPE",
  "NORTHERN_EUROPE",
  "SOUTHERN_EUROPE",
  "CENTRAL_EUROPE",
  "CEE",
  "SOUTHEAST_EUROPE",
  "BALKANS",
  "WESTERN_BALKANS",
  "EMEA",
  "CIS",
  "POST_SOVIET",
  "CAUCASUS",
  "DACH",
  "NORDICS",
  "SCANDINAVIA",
  "BALTICS",
  "BENELUX",
  "UKI",
  "LATAM",
  "SOUTH_AMERICA",
  "CENTRAL_AMERICA",
  "CARIBBEAN",
  "NORTH_AMERICA",
  "AMERICAS",
  "APAC",
  "ASIA",
  "EAST_ASIA",
  "SOUTHEAST_ASIA",
  "SOUTH_ASIA",
  "CENTRAL_ASIA",
  "MIDDLE_EAST",
  "MENA",
  "GCC",
  "AFRICA",
  "NORTH_AFRICA",
  "SUB_SAHARAN_AFRICA",
  "OCEANIA",
  "ANZ",
] as const;
export type RegionCode = (typeof REGION_CODES)[number];

export type MembershipConfidence = "certain" | "likely" | "ambiguous";

export interface RegionMembership {
  contains: boolean;
  confidence: MembershipConfidence;
}

export interface RegionMember {
  country: CountryCode;
  confidence: MembershipConfidence;
}

interface RegionDefinition {
  code: RegionCode;
  name: string;
  /** Phrases that name the region in posts. Case-sensitive, like country names. */
  aliases: readonly string[];
  /** Contains, certain. */
  certain: readonly CountryCode[];
  /** Contains, likely. */
  likely?: readonly CountryCode[];
  /** Contains per one definition, ambiguous in use. */
  ambiguousIn?: readonly CountryCode[];
  /** Outside per the definition, but some usage includes it: ambiguous. */
  ambiguousOut?: readonly CountryCode[];
  /** Outside per the definition, but colloquial usage sometimes includes it: likely outside. */
  likelyOut?: readonly CountryCode[];
  /** Short note of the definition and its source tags. */
  definition: string;
  /**
   * A looser everyday meaning employers also use ("CIS" for any post-Soviet country). Countries in
   * `members` may be meant even when the definition leaves them out; `ambiguous` ones sometimes.
   */
  colloquial?: {
    members: readonly CountryCode[];
    ambiguous?: readonly CountryCode[];
    note: string;
  };
}

// ---- M49 building blocks [M49] -------------------------------------------------------------
const M49_EASTERN_EUROPE = ["BY", "BG", "CZ", "HU", "PL", "MD", "RO", "RU", "SK", "UA"];
const M49_NORTHERN_EUROPE = [
  "AX",
  "DK",
  "EE",
  "FO",
  "FI",
  "GG",
  "IS",
  "IE",
  "IM",
  "JE",
  "LV",
  "LT",
  "NO",
  "SE",
  "GB",
];
const M49_SOUTHERN_EUROPE = [
  "AL",
  "AD",
  "BA",
  "HR",
  "GI",
  "GR",
  "VA",
  "IT",
  "MT",
  "ME",
  "MK",
  "PT",
  "SM",
  "RS",
  "SI",
  "ES",
];
const M49_WESTERN_EUROPE = ["AT", "BE", "FR", "DE", "LI", "LU", "MC", "NL", "CH"];
const M49_WESTERN_ASIA = [
  "AM",
  "AZ",
  "BH",
  "CY",
  "GE",
  "IQ",
  "IL",
  "JO",
  "KW",
  "LB",
  "OM",
  "PS",
  "QA",
  "SA",
  "SY",
  "TR",
  "AE",
  "YE",
];
const M49_CENTRAL_ASIA = ["KZ", "KG", "TJ", "TM", "UZ"];
const M49_EASTERN_ASIA = ["CN", "HK", "MO", "KP", "JP", "MN", "KR", "TW"];
const M49_SOUTHEASTERN_ASIA = ["BN", "KH", "ID", "LA", "MY", "MM", "PH", "SG", "TH", "TL", "VN"];
const M49_SOUTHERN_ASIA = ["AF", "BD", "BT", "IN", "IR", "MV", "NP", "PK", "LK"];
const M49_NORTHERN_AFRICA = ["DZ", "EG", "LY", "MA", "SD", "TN"];
const M49_SUB_SAHARAN_AFRICA = [
  // Eastern Africa
  "BI",
  "KM",
  "DJ",
  "ER",
  "ET",
  "KE",
  "MG",
  "MW",
  "MU",
  "MZ",
  "RE",
  "RW",
  "SC",
  "SO",
  "SS",
  "UG",
  "TZ",
  "ZM",
  "ZW",
  // Middle Africa
  "AO",
  "CM",
  "CF",
  "TD",
  "CG",
  "CD",
  "GQ",
  "GA",
  "ST",
  // Southern Africa
  "BW",
  "SZ",
  "LS",
  "NA",
  "ZA",
  // Western Africa
  "BJ",
  "BF",
  "CV",
  "CI",
  "GM",
  "GH",
  "GN",
  "GW",
  "LR",
  "ML",
  "MR",
  "NE",
  "NG",
  "SN",
  "SL",
  "TG",
];
const M49_CARIBBEAN = [
  "AG",
  "AW",
  "BS",
  "BB",
  "VG",
  "KY",
  "CU",
  "CW",
  "DM",
  "DO",
  "GD",
  "GP",
  "HT",
  "JM",
  "MQ",
  "PR",
  "KN",
  "LC",
  "VC",
  "TT",
  "VI",
];
const M49_CENTRAL_AMERICA = ["BZ", "CR", "SV", "GT", "HN", "MX", "NI", "PA"];
const M49_SOUTH_AMERICA = [
  "AR",
  "BO",
  "BR",
  "CL",
  "CO",
  "EC",
  "GF",
  "GY",
  "PY",
  "PE",
  "SR",
  "UY",
  "VE",
];
const M49_NORTHERN_AMERICA = ["BM", "CA", "GL", "US"];
const M49_OCEANIA = [
  "AU",
  "NZ",
  "FJ",
  "NC",
  "PG",
  "SB",
  "VU",
  "GU",
  "KI",
  "MH",
  "FM",
  "NR",
  "PW",
  "WS",
  "TO",
  "TV",
  "PF",
];

// ---- Political groupings ------------------------------------------------------------------
/** [EU] The 27 member states. */
const EU27 = [
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
];
/** Pemby target countries outside the EU. None is in the EU, EEA, EFTA or Schengen [EU][CAND]. */
const BALKAN_TARGETS = ["RS", "BA", "ME", "MK", "AL", "XK"];
const EASTERN_TARGETS = ["MD", "UA", "GE", "AM"];
const WESTERN_EUROPE_NON_EU = ["GB", "IS", "NO", "CH", "LI", "AD", "MC", "SM", "VA"];

const without = (list: readonly string[], drop: readonly string[]) =>
  list.filter((code) => !drop.includes(code));

const DEFINITIONS: readonly RegionDefinition[] = [
  {
    code: "EU",
    name: "European Union",
    aliases: ["European Union", "EU", "E.U.", "EU member states", "EU27", "EU-27"],
    certain: EU27,
    definition:
      "The 27 member states [EU]. Moldova, Ukraine, Georgia, Armenia and the Western Balkans are not members; " +
      "most are candidate or potential candidate countries [CAND], which confers no right to live or work in the EU.",
  },
  {
    code: "EEA",
    name: "European Economic Area",
    aliases: ["European Economic Area", "EEA"],
    certain: [...EU27, "IS", "LI", "NO"],
    definition:
      "EU27 plus the EEA EFTA states Iceland, Liechtenstein and Norway [EFTA]. No target country.",
  },
  {
    code: "EFTA",
    name: "European Free Trade Association",
    aliases: ["EFTA", "European Free Trade Association"],
    certain: ["IS", "LI", "NO", "CH"],
    definition: "Iceland, Liechtenstein, Norway, Switzerland [EFTA]. No target country.",
  },
  {
    code: "SCHENGEN",
    name: "Schengen Area",
    aliases: ["Schengen Area", "Schengen area", "Schengen zone", "Schengen"],
    certain: [...without(EU27, ["IE", "CY"]), "IS", "LI", "NO", "CH"],
    likely: ["CY"],
    definition:
      "29 countries [SCH]: EU27 without Ireland (opt-out), plus Iceland, Liechtenstein, Norway, Switzerland. " +
      "Cyprus is listed but has not lifted internal border controls, so it is only likely. No target country: " +
      "visa-free travel for Moldovans, Ukrainians, Georgians or Balkan citizens is not a right to work there.",
  },
  {
    code: "EUROPE",
    name: "Europe",
    aliases: ["Europe", "European", "continental Europe", "Continental Europe", "Europe-based"],
    certain: [...EU27, ...WESTERN_EUROPE_NON_EU, "AX", "FO", "GG", "GI", "IM", "JE"],
    // Owner decision 2026-09-17: Moldova, Ukraine and Georgia count as inside "Europe", never certain.
    // Georgia is transcontinental (M49 Western Asia, Council of Europe member, EU candidate [CAND]).
    ambiguousIn: [...BALKAN_TARGETS, "MD", "UA", "GE", "BY", "RU"],
    ambiguousOut: ["AM", "AZ", "TR", "KZ"],
    definition:
      "Geographically [M49] Europe includes Moldova, Ukraine and the Balkans, and Cyprus is an EU member though M49 " +
      "places it in Western Asia. Employers who write 'Europe' usually mean where they can employ people, which is " +
      "mostly the EU/EEA, UK and Switzerland. So Moldova, Ukraine and the Western Balkans are ambiguous (inside by " +
      "geography, often not meant), per research 02 product implication 5. Georgia and Armenia are in Western Asia " +
      "per M49 but are Council of Europe members; Georgia is an EU candidate [CAND]. Georgia is transcontinental and, " +
      "by owner decision of 2026-09-17, counted inside, ambiguous. Armenia stays outside, ambiguous. Belarus and " +
      "Russia: inside geographically, usually excluded by sanctions policy: ambiguous.",
  },
  {
    code: "EASTERN_EUROPE",
    name: "Eastern Europe",
    aliases: ["Eastern Europe", "Eastern European", "East Europe"],
    certain: without(M49_EASTERN_EUROPE, ["MD", "UA", "BY", "RU"]),
    likely: ["MD", "UA"],
    // Owner decision 2026-09-17: Georgia counts as inside "Eastern Europe", ambiguous (transcontinental,
    // M49 Western Asia).
    ambiguousIn: ["GE", "BY", "RU"],
    ambiguousOut: [...BALKAN_TARGETS, "AM", "EE", "LV", "LT", "HR", "SI"],
    definition:
      "M49 Eastern Europe: Belarus, Bulgaria, Czechia, Hungary, Poland, Moldova, Romania, Russia, Slovakia, Ukraine " +
      "[M49]. Moldova and Ukraine are named members, but employers may mean only EU members, so likely. The Balkans, " +
      "the Baltics and Armenia are often called Eastern Europe colloquially but are outside M49's group: ambiguous, " +
      "counted outside. Georgia is transcontinental (M49 Western Asia); by owner decision of 2026-09-17 it counts " +
      "inside, ambiguous.",
  },
  {
    code: "WESTERN_EUROPE",
    name: "Western Europe",
    aliases: ["Western Europe", "Western European", "West Europe"],
    certain: M49_WESTERN_EUROPE,
    likely: ["GB", "IE"],
    ambiguousIn: ["ES", "PT", "IT", "DK", "SE", "NO", "FI", "IS"],
    definition:
      "M49 Western Europe [M49]; the UK and Ireland are commonly included [INF]. No target country.",
  },
  {
    code: "NORTHERN_EUROPE",
    name: "Northern Europe",
    aliases: ["Northern Europe", "Northern European"],
    certain: M49_NORTHERN_EUROPE,
    definition: "M49 Northern Europe [M49]. No target country.",
  },
  {
    code: "SOUTHERN_EUROPE",
    name: "Southern Europe",
    aliases: ["Southern Europe", "Southern European", "South Europe"],
    certain: without(M49_SOUTHERN_EUROPE, BALKAN_TARGETS),
    likely: BALKAN_TARGETS,
    likelyOut: ["MD", "UA", "GE", "AM"],
    definition:
      "M49 Southern Europe includes Albania, Bosnia and Herzegovina, Montenegro, North Macedonia and Serbia [M49] " +
      "(Kosovo is not listed in M49; treated like its neighbours). Employers often mean Spain, Portugal, Italy and " +
      "Greece, so the Balkan members are likely, not certain.",
  },
  {
    code: "CENTRAL_EUROPE",
    name: "Central Europe",
    aliases: ["Central Europe"],
    certain: [],
    likely: ["AT", "CZ", "DE", "HU", "LI", "PL", "SK", "SI", "CH"],
    ambiguousOut: ["HR", "RO", "LT", ...BALKAN_TARGETS],
    likelyOut: ["MD", "UA", "GE", "AM"],
    definition: "No official definition [INF]. Moldova and Ukraine are not usually counted.",
  },
  {
    code: "CEE",
    name: "Central and Eastern Europe",
    aliases: [
      "Central and Eastern Europe",
      "Central & Eastern Europe",
      "Central Eastern Europe",
      "Central-Eastern Europe",
      "CEE",
      "CEE region",
    ],
    certain: ["AL", "BG", "HR", "CZ", "HU", "PL", "RO", "SK", "SI", "EE", "LV", "LT"],
    ambiguousIn: ["MD", "UA", "RS", "BA", "ME", "MK", "XK", "BY", "RU"],
    ambiguousOut: ["GE", "AM"],
    definition:
      "OECD's CEEC list (Albania, Bulgaria, Croatia, Czechia, Hungary, Poland, Romania, Slovakia, Slovenia, " +
      "Estonia, Latvia, Lithuania) [OECD, UNVERIFIED this session]. Employers often include Ukraine, Moldova and " +
      "the other Western Balkans, but not always [INF]: ambiguous.",
  },
  {
    code: "SOUTHEAST_EUROPE",
    name: "South-East Europe",
    aliases: [
      "South-East Europe",
      "Southeast Europe",
      "South East Europe",
      "Southeastern Europe",
      "SEE region",
    ],
    certain: ["AL", "BA", "BG", "HR", "GR", "XK", "ME", "MK", "RO", "RS", "SI"],
    likely: ["MD", "TR"],
    likelyOut: ["UA", "GE", "AM"],
    definition:
      "The South-East Europe participants of the Regional Cooperation Council [RCC]: Albania, Bosnia and " +
      "Herzegovina, Bulgaria, Croatia, Greece, Kosovo, Moldova, Montenegro, North Macedonia, Romania, Serbia, " +
      "Slovenia, Türkiye. Moldova is a participant, but geographic usage often leaves it out: likely.",
  },
  {
    code: "BALKANS",
    name: "Balkans",
    aliases: ["Balkans", "the Balkans", "Balkan countries", "Balkan region", "Balkan"],
    certain: ["AL", "BA", "BG", "XK", "ME", "MK", "RS"],
    likely: ["HR", "GR"],
    ambiguousIn: ["SI", "RO", "TR"],
    likelyOut: ["MD", "UA", "GE", "AM"],
    definition:
      "No official list [INF]. The Balkan peninsula states; Croatia and Greece are usually included; Slovenia, " +
      "Romania and Türkiye are partly on it. Moldova is not a Balkan country (it borders Romania, not the " +
      "peninsula), though some 'South-East Europe' lists include it [RCC]: likely outside.",
  },
  {
    code: "WESTERN_BALKANS",
    name: "Western Balkans",
    aliases: ["Western Balkans", "West Balkans"],
    certain: BALKAN_TARGETS,
    ambiguousOut: ["HR"],
    definition:
      "EU term: Albania, Bosnia and Herzegovina, Kosovo, Montenegro, North Macedonia, Serbia [WB]. Croatia was " +
      "counted before joining the EU in 2013: ambiguous. Moldova is not in it.",
  },
  {
    code: "EMEA",
    name: "Europe, the Middle East and Africa",
    aliases: [
      "EMEA",
      "Europe, Middle East and Africa",
      "Europe, the Middle East and Africa",
      "Europe, Middle East & Africa",
      "Europe, Middle East, and Africa",
      "Europe, the Middle East, and Africa",
    ],
    certain: [...EU27, ...WESTERN_EUROPE_NON_EU],
    likely: [
      ...BALKAN_TARGETS,
      ...EASTERN_TARGETS,
      "AX",
      "FO",
      "GG",
      "GI",
      "IM",
      "JE",
      ...without(M49_WESTERN_ASIA, ["SY", "YE", "AM", "GE", "CY"]),
      "IR",
      ...M49_NORTHERN_AFRICA,
      ...M49_SUB_SAHARAN_AFRICA,
    ],
    ambiguousIn: ["BY", "RU", "SY", "YE"],
    ambiguousOut: M49_CENTRAL_ASIA,
    definition:
      "No official definition [INF]; built from M49 Europe, Western Asia and Africa [M49]. Moldova, Ukraine, " +
      "Georgia, Armenia and the Western Balkans are inside by any definition, but employers who say 'EMEA' often " +
      "mean their entity countries, so likely, never certain. Central Asia is sometimes grouped in: ambiguous.",
  },
  {
    code: "CIS",
    name: "Commonwealth of Independent States",
    aliases: ["CIS", "Commonwealth of Independent States", "CIS countries", "CIS region"],
    certain: ["AZ", "AM", "BY", "KZ", "KG", "RU", "TJ", "UZ"],
    likely: ["TM"],
    ambiguousIn: ["MD"],
    ambiguousOut: ["UA"],
    likelyOut: ["GE"],
    // B3 M4: colloquial "CIS" means post-Soviet; an exclusion of "CIS countries" may cover these.
    colloquial: {
      members: ["GE", "UA", "MD", "AM", "AZ", "BY", "KZ", "KG", "TJ", "TM", "UZ", "RU"],
      ambiguous: ["EE", "LV", "LT"],
      note:
        "Employers often write 'CIS' for the former Soviet Union [INF]: Georgia, Ukraine and Moldova " +
        "(formally outside or leaving) are commonly meant; the Baltic states sometimes are.",
    },
    definition:
      "Participant states [CIS]. Armenia is a member. Moldova denounced the founding agreement and charter in " +
      "April 2026 and leaves on 2027-04-08 [CIS]: still formally inside until then, so ambiguous (revisit after " +
      "that date: outside, certain). Ukraine never ratified the charter and left all CIS bodies in 2018 [CIS]: " +
      "ambiguous, counted outside. Georgia left in 2009 [CIS], but colloquial 'CIS' (post-Soviet) sometimes " +
      "includes it: likely outside. Turkmenistan is an associate member: likely.",
  },
  {
    code: "POST_SOVIET",
    name: "Post-Soviet states",
    aliases: ["post-Soviet", "Post-Soviet", "former Soviet Union", "former USSR", "ex-USSR"],
    certain: [
      "AM",
      "AZ",
      "BY",
      "EE",
      "GE",
      "KZ",
      "KG",
      "LV",
      "LT",
      "MD",
      "RU",
      "TJ",
      "TM",
      "UA",
      "UZ",
    ],
    definition: "The 15 former Soviet republics (historical fact).",
  },
  {
    code: "CAUCASUS",
    name: "South Caucasus",
    aliases: ["South Caucasus", "Caucasus", "Transcaucasia", "Caucasus region"],
    certain: ["AM", "AZ", "GE"],
    ambiguousIn: ["RU"],
    definition:
      "Armenia, Azerbaijan, Georgia [INF, geographic]. Russia's North Caucasus: ambiguous.",
  },
  {
    code: "DACH",
    name: "DACH",
    aliases: ["DACH", "D-A-CH", "DACH region"],
    certain: ["DE", "AT", "CH"],
    ambiguousIn: ["LI"],
    definition: "Germany, Austria, Switzerland [INF]. No target country.",
  },
  {
    code: "NORDICS",
    name: "Nordic countries",
    aliases: ["Nordics", "Nordic countries", "Nordic region", "Nordic"],
    certain: ["DK", "FI", "IS", "NO", "SE"],
    likely: ["FO", "GL", "AX"],
    definition:
      "Denmark, Finland, Iceland, Norway, Sweden plus Faroe Islands, Greenland, Åland [INF]. No target.",
  },
  {
    code: "SCANDINAVIA",
    name: "Scandinavia",
    aliases: ["Scandinavia", "Scandinavian countries", "Scandinavian"],
    certain: ["DK", "NO", "SE"],
    ambiguousIn: ["FI", "IS"],
    definition: "Denmark, Norway, Sweden; Finland and Iceland in looser usage [INF]. No target.",
  },
  {
    code: "BALTICS",
    name: "Baltic states",
    aliases: ["Baltics", "Baltic states", "Baltic countries", "Baltic region"],
    certain: ["EE", "LV", "LT"],
    definition: "Estonia, Latvia, Lithuania [INF]. No target.",
  },
  {
    code: "BENELUX",
    name: "Benelux",
    aliases: ["Benelux"],
    certain: ["BE", "NL", "LU"],
    definition: "Belgium, Netherlands, Luxembourg. No target.",
  },
  {
    code: "UKI",
    name: "UK and Ireland",
    aliases: ["UK&I", "UK & I", "UKI", "UK and Ireland", "UK & Ireland", "British Isles"],
    certain: ["GB", "IE"],
    likely: ["IM", "JE", "GG"],
    definition: "United Kingdom and Ireland [INF]. No target.",
  },
  {
    code: "LATAM",
    name: "Latin America",
    aliases: [
      "LATAM",
      "LatAm",
      "Latam",
      "Latin America",
      "Latin American",
      "Latin America and the Caribbean",
      "América Latina",
      "Latinoamérica",
    ],
    certain: [
      "AR",
      "BO",
      "BR",
      "CL",
      "CO",
      "CR",
      "CU",
      "DO",
      "EC",
      "SV",
      "GT",
      "HN",
      "MX",
      "NI",
      "PA",
      "PY",
      "PE",
      "UY",
      "VE",
    ],
    likely: ["PR", "HT", "GF"],
    ambiguousIn: ["BZ", "GY", "SR", ...without(M49_CARIBBEAN, ["CU", "DO", "PR", "HT"])],
    definition:
      "No official definition [INF]. Spanish- and Portuguese-speaking Americas are certain; M49 'Latin America and " +
      "the Caribbean' [M49] also includes English- and Dutch-speaking states, which employers may not mean: " +
      "ambiguous. No European or Caucasus target is inside.",
  },
  {
    code: "SOUTH_AMERICA",
    name: "South America",
    aliases: ["South America", "South American"],
    certain: M49_SOUTH_AMERICA,
    definition: "M49 South America [M49].",
  },
  {
    code: "CENTRAL_AMERICA",
    name: "Central America",
    aliases: ["Central America", "Central American"],
    certain: without(M49_CENTRAL_AMERICA, ["MX"]),
    ambiguousIn: ["MX"],
    definition:
      "M49 Central America includes Mexico [M49]; common usage does not: Mexico ambiguous.",
  },
  {
    code: "CARIBBEAN",
    name: "Caribbean",
    aliases: ["Caribbean", "the Caribbean"],
    certain: M49_CARIBBEAN,
    definition: "M49 Caribbean [M49].",
  },
  {
    code: "NORTH_AMERICA",
    name: "North America",
    aliases: ["North America", "North American", "NORAM", "NorAm"],
    certain: ["US", "CA"],
    likely: ["BM", "GL"],
    ambiguousIn: ["MX"],
    definition:
      "M49 Northern America: Bermuda, Canada, Greenland, United States [M49]. Mexico is North American by the " +
      "continental definition but M49 puts it in Central America, and US employers rarely mean it: ambiguous.",
  },
  {
    code: "AMERICAS",
    name: "Americas",
    aliases: ["Americas", "the Americas", "AMER", "AMERS"],
    certain: [
      ...M49_NORTHERN_AMERICA,
      ...M49_CENTRAL_AMERICA,
      ...M49_SOUTH_AMERICA,
      ...M49_CARIBBEAN,
    ],
    definition: "M49 Americas [M49]. No European or Caucasus target.",
  },
  {
    code: "APAC",
    name: "Asia-Pacific",
    aliases: ["APAC", "Asia-Pacific", "Asia Pacific", "APJ", "APJC", "Asia & Pacific"],
    certain: ["AU", "NZ", "JP", "KR", "CN", "HK", "TW", "MO", "SG", "MY", "ID", "PH", "TH", "VN"],
    likely: [
      "IN",
      "BD",
      "LK",
      "NP",
      "PK",
      "KH",
      "LA",
      "MM",
      "BN",
      "MN",
      "TL",
      ...without(M49_OCEANIA, ["AU", "NZ"]),
    ],
    ambiguousOut: [...M49_CENTRAL_ASIA, "AF", "BT", "MV"],
    likelyOut: ["GE", "AM", "AZ"],
    definition:
      "No official definition [INF]. East and South-East Asia and Australia/New Zealand are certain; South Asia " +
      "and the Pacific islands likely; Central Asia ambiguous. Georgia and Armenia are not in APAC.",
  },
  {
    code: "ASIA",
    name: "Asia",
    aliases: ["Asia"],
    certain: [
      ...M49_CENTRAL_ASIA,
      ...M49_EASTERN_ASIA,
      ...M49_SOUTHEASTERN_ASIA,
      ...M49_SOUTHERN_ASIA,
      ...without(M49_WESTERN_ASIA, ["AM", "AZ", "CY", "GE", "TR"]),
    ],
    ambiguousIn: ["AM", "AZ", "GE", "TR", "CY", "RU"],
    definition:
      "M49 Asia [M49]. Georgia, Armenia and Azerbaijan are M49 Western Asia but employers who write 'Asia' " +
      "rarely mean them: ambiguous.",
  },
  {
    code: "EAST_ASIA",
    name: "East Asia",
    aliases: ["East Asia", "Eastern Asia"],
    certain: M49_EASTERN_ASIA,
    definition: "M49 Eastern Asia [M49].",
  },
  {
    code: "SOUTHEAST_ASIA",
    name: "South-East Asia",
    aliases: ["Southeast Asia", "South-East Asia", "South East Asia"],
    certain: M49_SOUTHEASTERN_ASIA,
    definition: "M49 South-eastern Asia [M49].",
  },
  {
    code: "SOUTH_ASIA",
    name: "South Asia",
    aliases: ["South Asia", "South Asian", "Indian subcontinent"],
    certain: without(M49_SOUTHERN_ASIA, ["IR"]),
    ambiguousIn: ["IR"],
    definition:
      "M49 Southern Asia [M49]; Iran is included by M49 but usually counted as Middle East.",
  },
  {
    code: "CENTRAL_ASIA",
    name: "Central Asia",
    aliases: ["Central Asia"],
    certain: M49_CENTRAL_ASIA,
    definition: "M49 Central Asia [M49].",
  },
  {
    code: "MIDDLE_EAST",
    name: "Middle East",
    aliases: ["Middle East", "Middle Eastern"],
    certain: ["AE", "BH", "IL", "IQ", "IR", "JO", "KW", "LB", "OM", "PS", "QA", "SA", "SY", "YE"],
    likely: ["EG", "TR"],
    ambiguousIn: ["CY"],
    ambiguousOut: ["GE", "AM", "AZ"],
    definition:
      "No official definition [INF]; M49 Western Asia minus the Caucasus and Cyprus, plus Iran [M49]. Georgia, " +
      "Armenia and Azerbaijan are M49 Western Asia but not usually 'Middle East': ambiguous, counted outside.",
  },
  {
    code: "MENA",
    name: "Middle East and North Africa",
    aliases: ["MENA", "Middle East and North Africa", "Middle East & North Africa", "MENAT"],
    certain: [
      "AE",
      "BH",
      "IL",
      "IQ",
      "IR",
      "JO",
      "KW",
      "LB",
      "OM",
      "PS",
      "QA",
      "SA",
      "SY",
      "YE",
      "DZ",
      "EG",
      "LY",
      "MA",
      "TN",
    ],
    likely: ["DJ", "MT"],
    ambiguousIn: ["TR", "SD", "MR"],
    ambiguousOut: ["GE", "AM", "AZ", "CY"],
    definition: "No official definition [INF]. No target country.",
  },
  {
    code: "GCC",
    name: "Gulf Cooperation Council",
    aliases: ["GCC", "Gulf Cooperation Council", "GCC countries"],
    certain: ["AE", "BH", "KW", "OM", "QA", "SA"],
    definition: "The six GCC member states [INF, widely documented]. No target.",
  },
  {
    code: "AFRICA",
    name: "Africa",
    aliases: ["Africa", "African"],
    certain: [...M49_NORTHERN_AFRICA, ...M49_SUB_SAHARAN_AFRICA],
    definition: "M49 Africa [M49].",
  },
  {
    code: "NORTH_AFRICA",
    name: "North Africa",
    aliases: ["North Africa", "Northern Africa", "North African"],
    certain: M49_NORTHERN_AFRICA,
    definition: "M49 Northern Africa [M49].",
  },
  {
    code: "SUB_SAHARAN_AFRICA",
    name: "Sub-Saharan Africa",
    aliases: ["Sub-Saharan Africa", "Sub Saharan Africa"],
    certain: M49_SUB_SAHARAN_AFRICA,
    definition: "M49 Sub-Saharan Africa [M49].",
  },
  {
    code: "OCEANIA",
    name: "Oceania",
    aliases: ["Oceania"],
    certain: M49_OCEANIA,
    definition: "M49 Oceania [M49].",
  },
  {
    code: "ANZ",
    name: "Australia and New Zealand",
    aliases: ["ANZ", "Australia and New Zealand", "Australia & New Zealand", "AU/NZ", "AUNZ"],
    certain: ["AU", "NZ"],
    definition: "Australia and New Zealand [M49].",
  },
];

interface CompiledRegion {
  definition: RegionDefinition;
  membership: ReadonlyMap<CountryCode, RegionMembership>;
}

function compile(def: RegionDefinition): CompiledRegion {
  const membership = new Map<CountryCode, RegionMembership>();
  const put = (codes: readonly CountryCode[] | undefined, value: RegionMembership) => {
    for (const code of codes ?? []) {
      if (membership.has(code)) {
        throw new Error(`region ${def.code}: ${code} listed twice`);
      }
      membership.set(code, value);
    }
  };
  put(def.certain, { contains: true, confidence: "certain" });
  put(def.likely, { contains: true, confidence: "likely" });
  put(def.ambiguousIn, { contains: true, confidence: "ambiguous" });
  put(def.ambiguousOut, { contains: false, confidence: "ambiguous" });
  put(def.likelyOut, { contains: false, confidence: "likely" });
  return { definition: def, membership };
}

const REGIONS: ReadonlyMap<RegionCode, CompiledRegion> = new Map(
  DEFINITIONS.map((def) => [def.code, compile(def)]),
);

const OUTSIDE_CERTAIN: RegionMembership = Object.freeze({ contains: false, confidence: "certain" });

export function isRegionCode(value: string): value is RegionCode {
  return REGIONS.has(value as RegionCode);
}

/**
 * Whether `country` is in `region`, with confidence. Countries the definition does not mention are
 * outside, certain.
 */
export function regionContains(region: RegionCode, country: CountryCode): RegionMembership {
  const compiled = REGIONS.get(region);
  if (!compiled) throw new Error(`unknown region ${region}`);
  return compiled.membership.get(country.toUpperCase()) ?? OUTSIDE_CERTAIN;
}

/** Why `regionContains` answered as it did. */
export type MembershipBasis =
  /** Listed as a member (certain, likely or ambiguous). */
  | "member"
  /** Outside, but some usage includes it (confidence likely). */
  | "likely-out"
  /** Outside, definitions disagree (confidence ambiguous). */
  | "ambiguous-out"
  /** Not mentioned by the definition: outside, certain. */
  | "unlisted";

export interface RegionMembershipDetail extends RegionMembership {
  basis: MembershipBasis;
  /** The colloquial reading of the region: "member", "ambiguous", or null when it says nothing. */
  colloquial: "member" | "ambiguous" | null;
}

/**
 * B3 M4: membership with its basis and the colloquial reading, so an engine can treat an exclusion
 * of "CIS countries" as unclear for Georgia or Ukraine instead of as "not excluded".
 */
export function regionMembershipDetail(
  region: RegionCode,
  country: CountryCode,
): RegionMembershipDetail {
  const compiled = REGIONS.get(region);
  if (!compiled) throw new Error(`unknown region ${region}`);
  const code = country.toUpperCase();
  const listed = compiled.membership.get(code);
  const basis: MembershipBasis = !listed
    ? "unlisted"
    : listed.contains
      ? "member"
      : listed.confidence === "likely"
        ? "likely-out"
        : "ambiguous-out";
  const colloquial = compiled.definition.colloquial;
  const reading = colloquial?.members.includes(code)
    ? "member"
    : colloquial?.ambiguous?.includes(code)
      ? "ambiguous"
      : null;
  return { ...(listed ?? OUTSIDE_CERTAIN), basis, colloquial: reading };
}

/** Every country the region contains at any confidence, most certain first. */
export function expandRegion(region: RegionCode): readonly RegionMember[] {
  const compiled = REGIONS.get(region);
  if (!compiled) throw new Error(`unknown region ${region}`);
  const rank = { certain: 0, likely: 1, ambiguous: 2 } as const;
  return [...compiled.membership]
    .filter(([, m]) => m.contains)
    .map(([country, m]) => ({ country, confidence: m.confidence }))
    .sort((a, b) => rank[a.confidence] - rank[b.confidence] || a.country.localeCompare(b.country));
}

export interface RegionInfo {
  code: RegionCode;
  name: string;
  aliases: readonly string[];
  definition: string;
}

export function regionInfo(region: RegionCode): RegionInfo {
  const compiled = REGIONS.get(region);
  if (!compiled) throw new Error(`unknown region ${region}`);
  const { code, name, aliases, definition } = compiled.definition;
  return { code, name, aliases, definition };
}

export const REGION_INFOS: readonly RegionInfo[] = DEFINITIONS.map((d) => regionInfo(d.code));
