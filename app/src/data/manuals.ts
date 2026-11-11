/**
 * The manuals library: links to each maker's own pages for install manuals,
 * owner's manuals and service notes. Nothing is copied or hosted here; every
 * link opens the maker's website, so it needs a signal.
 *
 * To add a link:
 *   1. Open the page in a browser and make sure it loads.
 *   2. Add an entry to MANUAL_LINKS with today's date in `checked`.
 *   3. If it's a new maker, add the maker to BRANDS with the website hosts
 *      that belong to it. The tests refuse any link whose host isn't one of
 *      its maker's own hosts, so a mirror or a manuals-sharing site can't slip in.
 *
 * Direct documents: when the maker's page lists PDFs with plain links, put
 * them in `docs`, copied from that page, so each one gets its own button and
 * opens straight away. `url` stays the maker's page the PDFs were read from;
 * the screen shows it as "More documents". A few makers keep their files on
 * a file store under another web address; list that address in the maker's
 * `fileHosts`, and only after seeing the maker's own page link to it.
 * `npm run check-links` (and a weekly GitHub check) opens every link and
 * lists the ones that stopped working.
 *
 * `models` holds the model numbers and series names a tech would type into
 * the search box. Spaces, dashes and case don't matter when searching.
 */

export type Category = 'door' | 'opener' | 'gate';

/** Who the door or operator is for. Gate gear always counts as commercial & gate. */
export type Market = 'residential' | 'commercial';

export const MARKET_LABEL: Record<Market, string> = {
  residential: 'Residential',
  commercial: 'Commercial & gate',
};

export type DocKind = 'install' | 'owner' | 'library' | 'troubleshooting' | 'bulletin';

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  install: 'Install manual',
  owner: "Owner's manual",
  library: 'Manual library',
  troubleshooting: 'Troubleshooting',
  bulletin: 'Service bulletin',
};

export interface Brand {
  id: string;
  name: string;
  /** Other names techs use for the maker; they also match in search. */
  aliases: string[];
  makes: Category[];
  /** The maker's own website hosts. Every link for this maker must use one. */
  hosts: string[];
  /**
   * Where the maker keeps its PDFs when that's not one of `hosts`: the start
   * of the address, e.g. 'https://literature.clopay.com/pdf_files/'. Only for
   * a file store the maker's own page links to.
   */
  fileHosts?: string[];
}

/** One document that opens straight away: a PDF, or a web page that is the manual. */
export interface ManualDoc {
  /** What's on the button, e.g. "Install manual (Spanish)". */
  label: string;
  url: string;
}

export interface ManualLink {
  id: string;
  brand: string;
  title: string;
  kind: DocKind;
  category: Category;
  models: string[];
  /** A short tip shown under the title, e.g. how to search the maker's page. */
  note?: string;
  /**
   * Who it's for. Left out, a link counts as residential, or as commercial &
   * gate when its category is 'gate'.
   */
  markets?: Market[];
  /** The maker's page. With `docs`, this is the "More documents" page the docs were read from. */
  url: string;
  /** Documents that open directly, one button each, in the order the maker lists them. */
  docs?: ManualDoc[];
  /** The day someone last opened the link and saw it load, as YYYY-MM-DD. */
  checked: string;
}

export const BRANDS: Brand[] = [
  {
    id: 'clopay',
    name: 'Clopay',
    aliases: [],
    makes: ['door'],
    hosts: ['www.clopaydoor.com', 'consumerservices.clopay.com'],
    // clopaydoor.com's support page links its PDFs here.
    fileHosts: ['https://literature.clopay.com/pdf_files/'],
  },
  { id: 'amarr', name: 'Amarr', aliases: [], makes: ['door'], hosts: ['www.amarr.com'] },
  {
    id: 'wayne-dalton',
    name: 'Wayne Dalton',
    aliases: ['Wayne-Dalton', 'WD', 'TorqueMaster'],
    makes: ['door'],
    hosts: ['www.wayne-dalton.com'],
  },
  {
    id: 'chi',
    name: 'C.H.I.',
    aliases: ['CHI', 'CHI Overhead Doors'],
    makes: ['door'],
    hosts: ['www.chiohd.com', 'windloaddocfinder.chiohd.com'],
  },
  {
    id: 'liftmaster',
    name: 'LiftMaster',
    aliases: ['Lift Master', 'Chamberlain Group', 'myQ'],
    makes: ['opener', 'gate'],
    hosts: ['support.chamberlaingroup.com', 'www.liftmaster.com'],
    // liftmaster.com's product pages link their PDFs to Chamberlain's file
    // store on Widen (account tag u=mcyivk).
    fileHosts: ['https://cgi.widen.net/content/'],
  },
  {
    id: 'chamberlain',
    name: 'Chamberlain',
    aliases: ['Chamberlain Group', 'myQ'],
    makes: ['opener'],
    hosts: ['support.chamberlaingroup.com', 'www.chamberlain.com'],
  },
  {
    id: 'genie',
    name: 'Genie',
    aliases: ['Genie Company', 'Aladdin Connect'],
    makes: ['opener'],
    hosts: ['www.geniecompany.com', 'store.geniecompany.com'],
  },
  {
    id: 'linear',
    name: 'Linear',
    aliases: ['Nice', 'Nice Linear', 'GTO', 'Mighty Mule'],
    makes: ['opener', 'gate'],
    hosts: ['linear-solutions.com'],
  },
  {
    id: 'marantec',
    name: 'Marantec',
    aliases: ['Marantec America'],
    makes: ['opener'],
    hosts: ['marantecamerica.com'],
  },
  {
    id: 'guardian',
    name: 'Guardian',
    aliases: ['Guardian Access', 'ADH Guardian', 'Guardian Access & Door Hardware'],
    makes: ['opener'],
    hosts: ['adhguardianusa.com'],
  },
  {
    id: 'overhead-door',
    name: 'Overhead Door',
    aliases: ['Overhead Door Corporation', 'OHD'],
    makes: ['door', 'opener'],
    // Overhead Door's own manual links on www.overheaddoor.com hand off to its
    // own file store; the link we keep is always the overheaddoor.com one.
    hosts: ['www.overheaddoor.com'],
  },
  {
    id: 'doorking',
    name: 'DoorKing',
    aliases: ['DKS', 'Door King'],
    makes: ['gate'],
    hosts: ['www.doorking.com'],
  },
  {
    id: 'rytec',
    name: 'Rytec',
    aliases: [],
    makes: ['door'],
    hosts: ['www.rytecdoors.com'],
  },
  {
    id: 'cornell-cookson',
    name: 'Cornell Cookson',
    aliases: ['CornellCookson', 'Cornell', 'Cookson'],
    makes: ['door'],
    hosts: ['clopay.cornellcookson.com'],
  },
  {
    id: 'chase',
    name: 'Chase Doors',
    aliases: ['Chase', 'Chase Industries'],
    makes: ['door'],
    hosts: ['www.chasedoors.com'],
    // chasedoors.com links its install PDFs to its own folder on this file store.
    fileHosts: ['https://assets.nlcnet.net/0633/'],
  },
  {
    id: 'bea',
    name: 'BEA',
    aliases: ['BEA Sensors'],
    makes: ['gate'],
    hosts: ['us.beasensors.com'],
  },
];

// Where each maker keeps its files. Each address below was read off the
// maker's own manuals page on the date in `checked`.
const CLOPAY_FILES = 'https://literature.clopay.com/pdf_files/';
const clopayPdf = (name: string) => `${CLOPAY_FILES}${name}.pdf`;
const liftmasterPdf = (path: string) => `https://cgi.widen.net/content/${path}?u=mcyivk&download=true`;
const doorkingPdf = (path: string) => `https://www.doorking.com/wp-content/uploads/${path}`;
const guardianPdf = (path: string) => `https://adhguardianusa.com/wp-content/uploads/${path}`;
const linearPdf = (name: string) => `https://linear-solutions.com/wp-content/uploads/${name}`;
const chasePdf = (path: string) => `https://assets.nlcnet.net/0633/documents/${path}`;
const beaPdf = (name: string) => `https://us.beasensors.com/files/downloads/products/lzr-h100/user-guides/en/${name}`;

const CLOPAY_SUPPORT = 'https://www.clopaydoor.com/residential/support';
const GUARDIAN_MANUALS = 'https://adhguardianusa.com/service/manuals/';
const LINEAR_MANUALS = 'https://linear-solutions.com/manuals/';
const CHASE_INSTALL = 'https://www.chasedoors.com/resources/installation-instructions';
const DOORKING_SUPPORT = 'https://www.doorking.com/tech-support/';

/** English, French and Spanish versions of one Clopay document. */
function clopayEnFrEs(label: string, en: string, fr: string, es: string): ManualDoc[] {
  return [
    { label, url: clopayPdf(en) },
    { label: `${label} (French)`, url: clopayPdf(fr) },
    { label: `${label} (Spanish)`, url: clopayPdf(es) },
  ];
}

/** DoorKing lists owner's manuals by when the operator was built. */
function doorkingByBuild(model: string, current: string, mid: string, early: string): ManualDoc[] {
  return [
    { label: `${model} owner's manual, built Aug 2018 to now`, url: doorkingPdf(current) },
    { label: `${model} owner's manual, built Jan 2016 to July 2018`, url: doorkingPdf(mid) },
    { label: `${model} owner's manual, built Jan 2016 and earlier`, url: doorkingPdf(early) },
  ];
}

const GUARDIAN_INSTALL_QUICK_REF: ManualDoc = {
  label: 'Install quick reference (615, 628, 715, 728, 7160V, 7280V)',
  url: guardianPdf('2025/03/Quick-Reference-Guide-4150V-4250V-4280V-1160V-7160V-7280V-Final1.pdf'),
};
const GUARDIAN_QUICK_REF: ManualDoc = { label: 'Quick reference guide', url: guardianPdf('2024/10/Quick_Reference_Guide_0.pdf') };
const LINEAR_GDO_PARTS: ManualDoc = { label: 'Replacement parts list', url: linearPdf('221377-Rev-R_ReplacementPartsListGDO_WEB-1.pdf') };
const LIFTMASTER_SERVICE_GUIDE: ManualDoc = {
  label: 'Commercial operators service guide',
  url: liftmasterPdf('nbfbhp831w/original/Commercial-Door-Operators-Service-Guide.pdf'),
};

export const MANUAL_LINKS: ManualLink[] = [
  // Clopay: every PDF below is linked from clopaydoor.com/residential/support.
  {
    id: 'clopay-steel-install',
    brand: 'clopay',
    title: 'Steel door install manuals: insulated, 1-layer and 2-layer',
    kind: 'install',
    category: 'door',
    models: ['insulated steel', 'steel', '1-layer', '2-layer', '3-layer', 'Classic', 'Gallery', 'Bridgeport', 'Modern Steel', 'sectional'],
    url: CLOPAY_SUPPORT,
    docs: [
      ...clopayEnFrEs('Insulated steel doors install manual', 'INST-4150077_EN', 'INST-4150077_FR', 'INST-4150077_ES'),
      ...clopayEnFrEs('1-layer and 2-layer doors install manual', 'INST-4150078_EN', 'INST-0137405_FR', 'INST-0137409_ES'),
      { label: 'Residential install supplement', url: clopayPdf('SUP-0137250_EN') },
    ],
    checked: '2026-11-11',
  },
  {
    id: 'clopay-wood-avante-install',
    brand: 'clopay',
    title: 'Wood and Avante install instructions',
    kind: 'install',
    category: 'door',
    models: ['wood', 'Avante', 'AX', 'AXU', 'AV', 'AVI', 'Avante Sleek', 'Sleek', 'Reserve', 'full view', 'glass'],
    url: CLOPAY_SUPPORT,
    docs: [
      { label: 'Wood doors install instructions', url: clopayPdf('INST-4150079_EN') },
      { label: 'Avante AX and AXU install instructions', url: clopayPdf('INST-4150619_EN') },
      { label: 'Avante AV and AVI install instructions', url: clopayPdf('INST-4150080_EN') },
      { label: 'Avante Sleek install instructions', url: clopayPdf('INST-4152629_EN') },
    ],
    checked: '2026-11-11',
  },
  {
    id: 'clopay-springs',
    brand: 'clopay',
    title: 'Spring supplements: torsion, extension and EZ-SET',
    kind: 'install',
    category: 'door',
    models: ['torsion spring', 'extension spring', 'spring', 'EZ-SET', 'EZ SET', 'EZSET'],
    url: CLOPAY_SUPPORT,
    docs: [
      ...clopayEnFrEs('Standard torsion spring', 'SUP-0137170_EN', 'SUP-0137419_FR', 'SUP-0137429_ES'),
      ...clopayEnFrEs('Standard extension spring', 'SUP-0137180_EN', 'SUP-0137415_FR', 'SUP-0137425_ES'),
      ...clopayEnFrEs('EZ-SET torsion spring', 'SUP-0130555_EN', 'SUP-0137417_FR', 'SUP-0137427_ES'),
      ...clopayEnFrEs('EZ-SET extension spring', 'SUP-0130550_EN', 'SUP-0137416_FR', 'SUP-0137426_ES'),
    ],
    checked: '2026-11-11',
  },
  {
    id: 'clopay-track-supplements',
    brand: 'clopay',
    title: 'Track supplements: low headroom and high lift',
    kind: 'install',
    category: 'door',
    models: ['low headroom', 'double track', 'high lift', 'conversion kit', 'track'],
    url: CLOPAY_SUPPORT,
    docs: [
      ...clopayEnFrEs("Double track low headroom, doors up to 8'", 'SUP-0130281_EN', 'SUP-0137418_FR', 'SUP-0137428_ES'),
      { label: "Double track low headroom, doors over 8'", url: clopayPdf('SUP-0130282_EN') },
      { label: 'Low headroom options', url: clopayPdf('SUP-0130297_EN') },
      { label: 'Low headroom conversion kit', url: clopayPdf('INST-0130285_EN') },
      { label: 'High lift track', url: clopayPdf('SUP-0130002_EN') },
      { label: '25 degree high lift track', url: clopayPdf('SUP-0137456_EN') },
    ],
    checked: '2026-11-11',
  },
  {
    id: 'clopay-windcode',
    brand: 'clopay',
    title: 'WindCode supplements (W1, W2 and higher)',
    kind: 'install',
    category: 'door',
    models: ['WindCode', 'wind load', 'W1', 'W2', 'W3', 'W4'],
    url: CLOPAY_SUPPORT,
    docs: [
      ...clopayEnFrEs('WindCode W1', 'SUP-0131221_EN', 'SUP-0137420_FR', 'SUP-0137430_ES'),
      ...clopayEnFrEs('WindCode W2 or higher', 'SUP-0137403_EN', 'SUP-0137421_FR', 'SUP-0137431_ES'),
    ],
    checked: '2026-11-11',
  },
  {
    id: 'clopay-opener-supplements',
    brand: 'clopay',
    title: 'Attaching an opener: supplements and lock hardware',
    kind: 'install',
    category: 'door',
    models: ['opener', 'opener bracket', '1-layer', '2-layer', '3-layer', 'lock', 'lock bar', 'snap-latch'],
    url: CLOPAY_SUPPORT,
    docs: [
      { label: 'Attaching an opener, 3-layer doors', url: clopayPdf('SUP-1038031_EN') },
      { label: 'Attaching an opener, 1-layer and 2-layer doors', url: clopayPdf('SUP-0131171_EN') },
      { label: '#3 lock bar assembly', url: clopayPdf('SUP-0137210_EN') },
      { label: '#1 snap-latch lock assembly', url: clopayPdf('SUP-0137220_EN') },
    ],
    checked: '2026-11-11',
  },
  {
    id: 'clopay-care',
    brand: 'clopay',
    title: 'Care and maintenance manuals',
    kind: 'owner',
    category: 'door',
    models: ['care', 'maintenance', 'steel', 'wood', 'Avante', 'VertiStack', 'Canyon Ridge', 'Grand Harbor', 'Coachman'],
    note: 'French and Spanish versions are on the maker\'s page.',
    url: CLOPAY_SUPPORT,
    docs: [
      { label: 'Steel doors', url: clopayPdf('CMB-4150089_EN') },
      { label: 'Wood doors', url: clopayPdf('CMB-4150088_EN') },
      { label: 'Avante', url: clopayPdf('CMB-4150087_EN') },
      { label: 'VertiStack Avante', url: clopayPdf('CMB-4156833_EN') },
      { label: 'Canyon Ridge', url: clopayPdf('CMB-4150084_EN') },
      { label: 'Grand Harbor', url: clopayPdf('CMB-4150086_EN') },
      { label: 'Coachman', url: clopayPdf('CMB-4150085_EN') },
    ],
    checked: '2026-11-11',
  },

  // Amarr
  {
    id: 'amarr-residential-install',
    brand: 'amarr',
    title: 'Residential install instructions and owner\'s manual',
    kind: 'install',
    category: 'door',
    models: ['steel', 'conventional hardware', 'aluminum', 'Horizon', 'Vista'],
    note: 'Steel doors use the conventional hardware instructions; Horizon and Vista use the aluminum ones.',
    url: 'https://www.amarr.com/us/en/garage-doors/get-support/installation-instructions',
    checked: '2026-11-10',
  },
  {
    id: 'amarr-all-install',
    brand: 'amarr',
    title: 'Residential and commercial install instructions',
    kind: 'library',
    category: 'door',
    markets: ['residential', 'commercial'],
    models: ['commercial', 'SuperFlex', 'rolling', '4000', '4100', '4200', '4300', '4400', '4500', '5101', '5501', '5601', '5652'],
    url: 'https://www.amarr.com/us/en/support/garage-door-and-commercial-door-installation-instructions',
    checked: '2026-11-10',
  },

  // Wayne Dalton
  {
    id: 'wayne-dalton-install',
    brand: 'wayne-dalton',
    title: 'Install instructions and supplements',
    kind: 'install',
    category: 'door',
    models: ['8000', '8100', '8200', '8300', '8500', '9100', '9405', '9600', '9605', '5120', '5145', '5150', '5155', '5200', '5255', 'Classic Steel', 'wind load', 'fiberglass', 'vinyl', 'aluminum', 'wood', 'steel', 'rolling'],
    url: 'https://www.wayne-dalton.com/resources/support/installation',
    checked: '2026-11-10',
  },
  {
    id: 'wayne-dalton-install-inserts',
    brand: 'wayne-dalton',
    title: 'Install inserts by door model',
    kind: 'install',
    category: 'door',
    models: ['8000', '8100', '8200', '8300', '8500', '9100', '9405', '9600', '9700', '9800', '5120', '5145', '6600', '8700', '888', '889', '700', '700c', 'Classic Steel', 'Builder', 'High Speed', 'vinyl', 'fiberglass', 'fire door', 'TorqueMaster', 'wind load'],
    note: 'The short inserts packed with each door, listed by model.',
    url: 'https://www.wayne-dalton.com/resources/support/install-inserts',
    checked: '2026-11-11',
  },

  // C.H.I.
  {
    id: 'chi-document-finder',
    brand: 'chi',
    title: 'Document finder',
    kind: 'library',
    category: 'door',
    models: ['Planks', 'Sterling', 'Skyline', 'Shoreline', 'carriage house', 'raised panel', 'shaker', 'full view', 'recessed panel', 'Timeless', 'Contemporary', 'WoodTones', 'Accents', '2250', '2251', '3286', '3220', '3240', '3250', '5300', '5600', '2551', '2583', '2127', '2147', '2157', '2328', '2348', '2358', '2283', '4283'],
    note: 'Search by door name or model number, then pick the file type.',
    url: 'https://www.chiohd.com/document-finder',
    checked: '2026-11-10',
  },
  {
    id: 'chi-wind-load',
    brand: 'chi',
    title: 'Wind load document finder',
    kind: 'library',
    category: 'door',
    models: ['wind load', 'windload', 'Texas', 'TX', 'impact'],
    note: 'Pick the state, width, model and zone to get the wind load drawing.',
    url: 'https://windloaddocfinder.chiohd.com/',
    checked: '2026-11-10',
  },

  // LiftMaster
  {
    id: 'liftmaster-manuals',
    brand: 'liftmaster',
    title: 'Manuals and parts search',
    kind: 'library',
    category: 'opener',
    models: ['8500', '8500W', '8550', '8587', '8160', '8165', '8355', '84505', 'WLED', 'Elite', 'jackshaft', 'wall mount', 'belt', 'chain'],
    note: 'Type the model number from the opener\'s label into the search on the page.',
    url: 'https://support.chamberlaingroup.com/s/manuals-parts#t=All',
    checked: '2026-11-10',
  },
  {
    id: 'liftmaster-troubleshooting',
    brand: 'liftmaster',
    title: 'Opener support: error codes, programming, troubleshooting',
    kind: 'troubleshooting',
    category: 'opener',
    models: ['error code', 'diagnostic', 'flashing', 'programming', 'myQ', 'Wi-Fi'],
    note: 'Filter by brand LiftMaster.',
    url: 'https://support.chamberlaingroup.com/s/garage-door-openers#t=All',
    checked: '2026-11-10',
  },

  // Chamberlain
  {
    id: 'chamberlain-manuals',
    brand: 'chamberlain',
    title: 'Manuals and parts search',
    kind: 'library',
    category: 'opener',
    models: ['B353', 'B550', 'B750', 'B970', 'B1381', 'B2202', 'B4603', 'B4613', 'B6713', 'B6753', 'C205', 'C2202', 'RJO101', 'HD950', 'CG40', 'PD200', '4620'],
    note: 'Type the model number from the opener\'s label into the search on the page.',
    url: 'https://support.chamberlaingroup.com/s/manuals-parts#t=All',
    checked: '2026-11-10',
  },
  {
    id: 'chamberlain-b4600-install',
    brand: 'chamberlain',
    title: 'B4603TC, B4643TC, B4613TC, B6713TC, B6753TC install manual',
    kind: 'install',
    category: 'opener',
    models: ['B4603TC', 'B4643TC', 'B4613TC', 'B6713TC', 'B6753TC', 'B4603', 'B4613'],
    note: 'Two versions: built in 2022 and after, and built before 2022.',
    url: 'https://support.chamberlaingroup.com/s/article/Chamberlain-B4603TC-B4643TC-B4613TC-B6313TC-B6753TC-Installation-Manual-English-French',
    checked: '2026-11-10',
  },
  {
    id: 'chamberlain-troubleshooting',
    brand: 'chamberlain',
    title: 'Opener support: error codes, programming, troubleshooting',
    kind: 'troubleshooting',
    category: 'opener',
    models: ['error code', 'diagnostic', 'flashing', 'programming', 'myQ', 'Wi-Fi'],
    note: 'Filter by brand Chamberlain.',
    url: 'https://support.chamberlaingroup.com/s/garage-door-openers#t=All',
    checked: '2026-11-10',
  },

  // Genie
  {
    id: 'genie-support',
    brand: 'genie',
    title: 'Support home: manuals, programming, Aladdin Connect',
    kind: 'library',
    category: 'opener',
    models: ['programming', 'HomeLink', 'Aladdin Connect', 'remote', 'keypad'],
    url: 'https://www.geniecompany.com/support',
    checked: '2026-11-10',
  },
  {
    id: 'genie-belt-chain-manual',
    brand: 'genie',
    title: 'Belt and chain drive opener manual',
    kind: 'owner',
    category: 'opener',
    models: ['belt', 'chain', 'ChainMax', 'StealthDrive', 'SilentMax'],
    url: 'https://www.geniecompany.com/files/en/manual/belt-chain-drive-garage-door-opener',
    checked: '2026-11-10',
  },
  {
    id: 'genie-screw-drive',
    brand: 'genie',
    title: 'Screw drive opener: install poster and owner\'s manual',
    kind: 'install',
    category: 'opener',
    models: ['screw', 'screw drive', 'Excelerator', 'Pro Max', '1022', '1024', '1042', '2022', '2024', '2042'],
    url: 'https://store.geniecompany.com/pages/screw-drive-garage-door-opener-product-support',
    checked: '2026-11-10',
  },
  {
    id: 'genie-wall-mount-install',
    brand: 'genie',
    title: 'Wall mount opener install instructions',
    kind: 'install',
    category: 'opener',
    models: ['wall mount', 'jackshaft', '6070H', '6170H', '6172H'],
    url: 'https://www.geniecompany.com/files/en/installation/wall-mount-garage-door-opener',
    checked: '2026-11-10',
  },
  {
    id: 'genie-wall-mount-manual',
    brand: 'genie',
    title: 'Wall mount opener manual',
    kind: 'owner',
    category: 'opener',
    models: ['wall mount', 'jackshaft', '6070H', '6170H', '6172H'],
    url: 'https://www.geniecompany.com/files/en/manual/wall-mount-garage-door-opener',
    checked: '2026-11-10',
  },
  {
    id: 'genie-wall-mount-support',
    brand: 'genie',
    title: 'Wall mount opener support and pre-install measurements',
    kind: 'troubleshooting',
    category: 'opener',
    models: ['wall mount', 'jackshaft', '6070H', '6070H-B', '6170H', '6170H-B', '6172H-B'],
    url: 'https://store.geniecompany.com/pages/wall-mount-garage-door-opener-product-support',
    checked: '2026-11-10',
  },

  // Linear: every file below is linked from linear-solutions.com/manuals/.
  {
    id: 'linear-manuals',
    brand: 'linear',
    title: 'All manuals: openers, gates, remotes and access control',
    kind: 'library',
    category: 'opener',
    models: ['remote', 'transmitter', 'receiver', 'radio', 'MegaCode', 'keypad', 'access control', 'telephone entry', 'AM3Plus', 'AE-100', 'commercial'],
    url: LINEAR_MANUALS,
    checked: '2026-11-11',
  },
  {
    id: 'linear-ldo-lso',
    brand: 'linear',
    title: 'LDO33, LDO50 and LSO50 opener manuals',
    kind: 'install',
    category: 'opener',
    models: ['LDO33', 'LDO50', 'LDO', 'LSO50', 'LSO50-2T1KB', 'LSO50-2T1KB8', 'chain', 'belt'],
    url: LINEAR_MANUALS,
    docs: [
      { label: 'LDO33 and LDO50 install manual', url: linearPdf('LDO.pdf') },
      { label: 'LDO33 and LDO50 user manual', url: linearPdf('LDO_user.pdf') },
      { label: 'LSO50 install manual', url: linearPdf('LSO50.pdf') },
      { label: 'LSO50 user manual', url: linearPdf('LSO50_user.pdf') },
      LINEAR_GDO_PARTS,
    ],
    checked: '2026-11-11',
  },
  {
    id: 'linear-ldco841-863',
    brand: 'linear',
    title: 'LDCO841 and LDCO863B opener manuals',
    kind: 'install',
    category: 'opener',
    models: ['LDCO841', 'LDCO863B', 'LDCO863', 'LDCO', 'HAE00072', 'wall station'],
    url: LINEAR_MANUALS,
    docs: [
      { label: 'Install manual', url: linearPdf('10028150-Rev-C-LDCO-841-863-Install-Manual_WEB.pdf') },
      { label: 'Install manual (Spanish)', url: linearPdf('10028172-Rev-B-LDCO-841-863-Install-Manual-ES_WEB.pdf') },
      { label: 'Install manual (French)', url: linearPdf('10028154-Rev-C-LDCO-841-863-Inst-Manual-FC_WEB.pdf') },
      { label: "Homeowner's manual", url: linearPdf('10028149-Rev-C-LDCO_841-863-Manual_WEB.pdf') },
      { label: "Homeowner's manual (Spanish)", url: linearPdf('10028171-Rev-B-LDCO_841-863-Manual_ES_WEB.pdf') },
      { label: "Homeowner's manual (French)", url: linearPdf('10028155-Rev-C-LDCO_841-863-Manual-FC_WEB.pdf') },
      { label: 'HAE00072 wall station', url: linearPdf('10029898-Rev-A-HAE00072-Instructions_WEB.pdf') },
      LINEAR_GDO_PARTS,
    ],
    checked: '2026-11-11',
  },
  {
    id: 'linear-ldco801',
    brand: 'linear',
    title: 'LDCO801 opener install, programming and user guides',
    kind: 'install',
    category: 'opener',
    models: ['LDCO801', 'LDCO', '801'],
    note: 'These open as web pages on Linear\'s site, not PDFs.',
    url: LINEAR_MANUALS,
    docs: [
      { label: 'Install manual', url: 'https://linear-solutions.com/linear-ldco801-installation-manual-english/' },
      { label: 'Install manual (Spanish)', url: 'https://linear-solutions.com/linear-ldco801-installation-manual-spanish/' },
      { label: 'Install manual (French)', url: 'https://linear-solutions.com/linear-ldco801-installation-manual-french/' },
      { label: 'Quick programming guide', url: 'https://linear-solutions.com/linear-ldco801-programming-guide-english/' },
      { label: 'Quick programming guide (Spanish)', url: 'https://linear-solutions.com/linear-ldco801-programming-guide-spanish/' },
      { label: 'User guide (Spanish)', url: 'https://linear-solutions.com/linear-ldco801-user-guide-spanish/' },
      { label: 'User guide (French)', url: 'https://linear-solutions.com/linear-ldco801-user-guide-french/' },
    ],
    checked: '2026-11-11',
  },
  {
    id: 'linear-ldco850-852',
    brand: 'linear',
    title: "LDCO850 and LDCO852 homeowner's manuals",
    kind: 'owner',
    category: 'opener',
    models: ['LDCO850', 'LDCO852', 'LDCO'],
    url: LINEAR_MANUALS,
    docs: [
      { label: "LDCO850 homeowner's manual", url: linearPdf('Linear-LDCO850-HomeOwners-Manual.pdf') },
      { label: "LDCO852 homeowner's manual", url: linearPdf('Linear-LDCO852-HomeOwners-Manual.pdf') },
    ],
    checked: '2026-11-11',
  },
  {
    id: 'linear-lco75',
    brand: 'linear',
    title: 'LCO75 opener manuals',
    kind: 'install',
    category: 'opener',
    models: ['LCO75', 'LCO'],
    url: LINEAR_MANUALS,
    docs: [
      { label: 'Install manual', url: linearPdf('LCO75.pdf') },
      { label: 'User manual', url: linearPdf('LCO75_user.pdf') },
      LINEAR_GDO_PARTS,
    ],
    checked: '2026-11-11',
  },
  {
    id: 'linear-swing-xls',
    brand: 'linear',
    title: 'Pro SW2000XLS, SW3000XLS and SW4000XLS swing gate manuals',
    kind: 'install',
    category: 'gate',
    models: ['SW2000XLS', 'SW3000XLS', 'SW4000XLS', 'LPA-PRO-SW2000XLS', 'LPA-PRO-SW3000XLS', 'LPA-PRO-SW4000XLS', 'SW2002XLS', 'SW3200XLS', 'SW4200XLS', 'XLS', 'swing gate'],
    url: LINEAR_MANUALS,
    docs: [
      { label: 'SW2000XLS single gate', url: linearPdf('GTO-Gate-Opener-Gate-Operator-Manual-prosw2000XLS.pdf') },
      { label: 'SW2000XLS double gate', url: linearPdf('GTO-Gate-Opener-Gate-Operator-Manual-prosw2002XLS.pdf') },
      { label: 'SW3000XLS single gate', url: linearPdf('GTO-Gate-Opener-Gate-Operator-Manual-prosw3000XLS.pdf') },
      { label: 'SW3000XLS double gate', url: linearPdf('GTO-Gate-Opener-Gate-Operator-Manual-prosw3200XLS.pdf') },
      { label: 'SW4000XLS single gate', url: linearPdf('4000XLS-Manual-01-10-12.pdf') },
      { label: 'SW4000XLS double gate', url: linearPdf('4000XLS-4200XLS-Manual-01-10-12.pdf') },
    ],
    checked: '2026-11-11',
  },
  {
    id: 'linear-swing-gates',
    brand: 'linear',
    title: 'Swing gate operator manuals: BGU, BGUS, SG, SWG, VS-GSWG, SWC, SWR',
    kind: 'install',
    category: 'gate',
    models: ['BGU', 'BGU-D', 'BGUS', 'SG', 'SG-D', 'SWG', 'VS-GSWG', 'SWC', 'SWD-211', 'SWR', 'APeX', 'swing gate'],
    url: LINEAR_MANUALS,
    docs: [
      { label: 'BGU and BGU-D install and owner\'s manual', url: linearPdf('P558-X18_WEB.pdf') },
      { label: 'BGUS install manual', url: linearPdf('P1275-X7_WEB.pdf') },
      { label: 'SG install manual', url: linearPdf('SG-SG-D.pdf') },
      { label: 'SWG install manual', url: linearPdf('P1227-X10_WEB.pdf') },
      { label: 'VS-GSWG install manual', url: linearPdf('P1250-X11_WEB.pdf') },
      { label: 'SWC, SWD-211 and SWR install manual', url: linearPdf('227965-X28_WEB.pdf') },
    ],
    checked: '2026-11-11',
  },
  {
    id: 'linear-slide-gates',
    brand: 'linear',
    title: 'Slide gate operator manuals: GSLG-A, HSLG, VS-GSLG, SLC, SLR, GPX-SL25, SL-2000B',
    kind: 'install',
    category: 'gate',
    models: ['GSLG', 'GSLG-A', 'HSLG', 'VS-GSLG', 'SLC', 'SLD-211', 'SLR', 'GPX-SL25', 'SL25', 'SL-2000B', 'SL2000B', 'APeX', 'slide gate'],
    url: LINEAR_MANUALS,
    docs: [
      { label: 'GSLG-A install manual', url: linearPdf('P1222X10_WEB.pdf') },
      { label: 'HSLG install manual', url: linearPdf('P1220-X14_WEB.pdf') },
      { label: 'VS-GSLG install manual', url: linearPdf('P1255-X10_WEB.pdf') },
      { label: 'SLC, SLD-211 and SLR install manual', url: linearPdf('227968-X26_WEB.pdf') },
      { label: 'GPX-SL25 install and owner\'s manual', url: linearPdf('GTO-Automatic-Gate-Operator-GPX-SL25-Manual.pdf') },
      { label: 'SL-2000B install manual', url: linearPdf('GTO-Gate-Opener-Gate-Operator-Manual-dc-slide.pdf') },
    ],
    checked: '2026-11-11',
  },
  {
    id: 'linear-gate-manuals',
    brand: 'linear',
    title: 'All gate operator and gate accessory manuals',
    kind: 'library',
    category: 'gate',
    models: ['gate', 'gate opener', 'GTO', 'Mighty Mule', 'solar', 'safety beam', 'gate lock', 'exit wand', 'gate edge'],
    note: 'Gate openers and their accessories are further down the same page.',
    url: LINEAR_MANUALS,
    checked: '2026-11-11',
  },

  // Marantec
  {
    id: 'marantec-synergy-200',
    brand: 'marantec',
    title: 'Synergy 260, 270, 280 owner\'s manual (install included)',
    kind: 'owner',
    category: 'opener',
    models: ['Synergy', '260', '270', '280', 'Synergy 260', 'Synergy 270', 'Synergy 280'],
    url: 'https://marantecamerica.com/wp-content/uploads/2024/12/Marantec_Synergy-200-Series_Owners-Manual_2021.12.pdf',
    checked: '2026-11-10',
  },
  {
    id: 'marantec-synergy-300',
    brand: 'marantec',
    title: 'Synergy 360, 370, 380 owner\'s manual (carriage house and wind-loaded doors)',
    kind: 'owner',
    category: 'opener',
    models: ['Synergy', '360', '370', '380', 'Synergy 360', 'Synergy 370', 'Synergy 380', 'carriage house', 'wind load'],
    url: 'https://marantecamerica.com/wp-content/uploads/2024/12/Marantec_Synergy-300-Series_Owners-Manual_2021.12.pdf',
    checked: '2026-11-10',
  },

  {
    id: 'marantec-synergy-solo',
    brand: 'marantec',
    title: "Synergy Solo owner's manual (install included)",
    kind: 'owner',
    category: 'opener',
    models: ['Synergy Solo', 'Solo', 'M13-807B', 'M13-808B', 'M15-21210B'],
    url: 'https://marantecamerica.com/wp-content/uploads/2024/12/Marantec_Synergy-Solo_Owners-Manual_2020.03.pdf',
    checked: '2026-11-11',
  },
  {
    id: 'marantec-m4500-m4700',
    brand: 'marantec',
    title: "M4500 and M4700 owner's manual (install included)",
    kind: 'owner',
    category: 'opener',
    models: ['M4500', 'M4700', 'M-4500', 'M-4700', 'Professional Series'],
    url: 'https://marantecamerica.com/wp-content/uploads/2024/12/Marantec_M4500M4700_Owners-Manual_English_2007.01.pdf',
    checked: '2026-11-11',
  },
  {
    id: 'marantec-m4500e-m4700e',
    brand: 'marantec',
    title: "M4500e and M4700e owner's manual (install included)",
    kind: 'owner',
    category: 'opener',
    models: ['M4500e', 'M4700e', 'Professional Series'],
    url: 'https://marantecamerica.com/wp-content/uploads/2024/12/Marantec_M4500eM4700e_Owners-Manual_2008.11.pdf',
    checked: '2026-11-11',
  },
  {
    id: 'marantec-ex2005-ex2007',
    brand: 'marantec',
    title: 'Deluxe EX-2005 and Elite EX-2007 install and operating instructions',
    kind: 'owner',
    category: 'opener',
    models: ['EX2005', 'EX2007', 'EX-2005', 'EX-2007', '2005', '2007', 'Deluxe', 'Elite'],
    url: 'https://marantecamerica.com/wp-content/uploads/2024/12/Marantec_EX2005EX2007_Owners-Manual_English_2007.01.pdf',
    checked: '2026-11-11',
  },
  {
    id: 'marantec-m50',
    brand: 'marantec',
    title: "M50 owner's manual (install included)",
    kind: 'owner',
    category: 'opener',
    models: ['M50', 'M10-907B', 'M10-908B', 'M10-910B', 'M10-807C', 'M10-808C', 'M10-810C'],
    url: 'https://marantecamerica.com/wp-content/uploads/2024/12/Marantec_M50_Owners-Manual_2012.07.pdf',
    checked: '2026-11-11',
  },
  {
    id: 'marantec-q7500-q7700',
    brand: 'marantec',
    title: "Q-Line Q7500 and Q7700 owner's manual",
    kind: 'owner',
    category: 'opener',
    models: ['Q7500', 'Q7700', 'Q-7500', 'Q-7700', 'Q-Line'],
    url: 'https://marantecamerica.com/wp-content/uploads/2024/12/Marantec_Q7500Q7700_Owners-Manual_English_2007.01.pdf',
    checked: '2026-11-11',
  },
  {
    id: 'marantec-rv8000',
    brand: 'marantec',
    title: "RV 8000 owner's manual (RV garages and pole barns)",
    kind: 'owner',
    category: 'opener',
    models: ['RV8000', 'RV 8000', 'pole barn', 'ML-2807B', 'ML-2808B', 'ML-2810B', 'ML-2812B', 'ML-2814B', 'ML-2807C', 'ML-2808C', 'ML-2810C'],
    url: 'https://marantecamerica.com/wp-content/uploads/2024/12/Marantec_RV8000_Owners-Manual_2010.05.pdf',
    checked: '2026-11-11',
  },
  {
    id: 'marantec-vta',
    brand: 'marantec',
    title: 'VTA variable-speed sectional door drive manual',
    kind: 'owner',
    category: 'opener',
    models: ['VTA', 'VTA 14-61', 'VTA 11-72', 'VTA 11-62', 'VTA 11-32', 'variable speed'],
    note: 'Jackshaft-style drive with quick-release (E) or chain hoist (KE).',
    url: 'https://marantecamerica.com/wp-content/uploads/2024/12/Marantec_VTA-Series_Owners-Manual_2023-08.pdf',
    checked: '2026-11-11',
  },

  // Guardian: every PDF below is linked from adhguardianusa.com/service/manuals/.
  {
    id: 'guardian-manuals',
    brand: 'guardian',
    title: 'All manuals: openers, remotes, keypads, beam smart controls, parts',
    kind: 'library',
    category: 'opener',
    models: ['remote', 'keypad', 'WKCC', 'DXB', 'UTX', 'external receiver', 'beam', 'smart', 'belt crimp', 'GUT-7B', 'GUT-8B', 'surge protector', 'parts', 'service bulletin', 'motion sensing'],
    url: GUARDIAN_MANUALS,
    docs: [
      { label: 'Motion sensing service bulletin', url: guardianPdf('2026/10/Motion-Sensing-Service-Bulletin.pdf') },
      { label: 'Belt and chain T-rail parts drawing', url: guardianPdf('2024/10/Parts-Explosion-Belt-and-Chain-T-rail_20180418.pdf') },
      { label: 'Wireless keypad (WKCC) instructions', url: guardianPdf('2024/10/WKCC_Instruction_201020.pdf') },
      { label: 'Remote control programming', url: guardianPdf('2024/10/REMOTE-CONTROL-Programming-Instructions_0.pdf') },
      { label: 'Deluxe remote (DXB) programming', url: guardianPdf('2024/10/Programming-Instructions-DXB_0.pdf') },
    ],
    checked: '2026-11-11',
  },
  {
    id: 'guardian-315',
    brand: 'guardian',
    title: "315 opener manual",
    kind: 'owner',
    category: 'opener',
    models: ['315'],
    url: GUARDIAN_MANUALS,
    docs: [
      { label: "315 manual", url: guardianPdf('2024/10/315_Manual_140418_0.pdf') },
      { label: "315 manual (French)", url: guardianPdf('2024/10/315_Manual_French_0.pdf') },
    ],
    checked: '2026-11-11',
  },
  {
    id: 'guardian-415',
    brand: 'guardian',
    title: '415 and 415-3T opener manuals',
    kind: 'owner',
    category: 'opener',
    models: ['415', '415-3T'],
    url: GUARDIAN_MANUALS,
    docs: [
      { label: '415 manual', url: guardianPdf('2024/10/Model-415-Manual.pdf') },
      { label: '415-3T manual', url: guardianPdf('2024/10/415-3T-Manual-0322.pdf') },
    ],
    checked: '2026-11-11',
  },
  {
    id: 'guardian-425-428',
    brand: 'guardian',
    title: '425 and 428 opener manuals',
    kind: 'owner',
    category: 'opener',
    models: ['425', '428'],
    url: GUARDIAN_MANUALS,
    docs: [
      { label: '425 manual', url: guardianPdf('2024/10/425_manual_20170929.pdf') },
      { label: '428 manual', url: guardianPdf('2024/10/Model-428-Manual.pdf') },
    ],
    checked: '2026-11-11',
  },
  {
    id: 'guardian-600sl',
    brand: 'guardian',
    title: '600SL opener manual',
    kind: 'owner',
    category: 'opener',
    models: ['600SL', '600'],
    url: GUARDIAN_MANUALS,
    docs: [{ label: '600SL manual', url: guardianPdf('2024/10/600SL_manual_130626.pdf') }],
    checked: '2026-11-11',
  },
  {
    id: 'guardian-615',
    brand: 'guardian',
    title: '615 opener manual',
    kind: 'owner',
    category: 'opener',
    models: ['615'],
    url: GUARDIAN_MANUALS,
    docs: [{ label: '615 manual', url: guardianPdf('2024/09/615_Manual.pdf') }, GUARDIAN_INSTALL_QUICK_REF],
    checked: '2026-11-11',
  },
  {
    id: 'guardian-628',
    brand: 'guardian',
    title: '628 opener manual',
    kind: 'owner',
    category: 'opener',
    models: ['628'],
    url: GUARDIAN_MANUALS,
    docs: [{ label: '628 manual', url: guardianPdf('2024/10/628_manual_20170929.pdf') }, GUARDIAN_QUICK_REF, GUARDIAN_INSTALL_QUICK_REF],
    checked: '2026-11-11',
  },
  {
    id: 'guardian-628fca',
    brand: 'guardian',
    title: '628FCA opener manual and Bluetooth pairing',
    kind: 'owner',
    category: 'opener',
    models: ['628FCA', 'Bluetooth', 'NFC'],
    url: GUARDIAN_MANUALS,
    docs: [
      { label: '628FCA manual', url: guardianPdf('2024/10/628FCA-Manual_20160811.pdf') },
      { label: 'Bluetooth and NFC pairing and control', url: guardianPdf('2024/10/628FCA-BT-NFC-pairing-and-control-instructions.pdf') },
      { label: 'Quick reference guide', url: guardianPdf('2024/10/Quick_Reference_Guide_2.pdf') },
    ],
    checked: '2026-11-11',
  },
  {
    id: 'guardian-715',
    brand: 'guardian',
    title: '715 and 715BBU opener manual',
    kind: 'owner',
    category: 'opener',
    models: ['715', '715BBU', '715B', 'battery backup'],
    note: "Guardian's 715B manual link opens the 728B manual, so it's left out here.",
    url: GUARDIAN_MANUALS,
    docs: [
      { label: '715BBU manual', url: guardianPdf('2024/10/Model-715-Manual.pdf') },
      { label: '715BBU manual (Spanish)', url: guardianPdf('2024/10/715BBU_manual_Spanish_181227.pdf') },
      GUARDIAN_QUICK_REF,
      GUARDIAN_INSTALL_QUICK_REF,
    ],
    checked: '2026-11-11',
  },
  {
    id: 'guardian-728b',
    brand: 'guardian',
    title: '728B opener manual',
    kind: 'owner',
    category: 'opener',
    models: ['728B', '728'],
    url: GUARDIAN_MANUALS,
    docs: [{ label: '728B manual', url: guardianPdf('2024/10/Model-728B-Manual.pdf') }, GUARDIAN_QUICK_REF, GUARDIAN_INSTALL_QUICK_REF],
    checked: '2026-11-11',
  },
  {
    id: 'guardian-7160v-7280v',
    brand: 'guardian',
    title: '7160V and 7280V opener manuals',
    kind: 'owner',
    category: 'opener',
    models: ['7160V', '7280V', '7160', '7280'],
    url: GUARDIAN_MANUALS,
    docs: [
      { label: '7160V manual', url: guardianPdf('2024/10/7160V-Product-Manual.pdf') },
      { label: '7280V manual', url: guardianPdf('2024/10/7280V-Manual.pdf') },
      GUARDIAN_INSTALL_QUICK_REF,
    ],
    checked: '2026-11-11',
  },
  {
    id: 'guardian-928',
    brand: 'guardian',
    title: '928 and 928V opener manuals and service bulletin',
    kind: 'owner',
    category: 'opener',
    models: ['928', '928V', 'B5A928'],
    url: GUARDIAN_MANUALS,
    docs: [
      { label: '928 manual', url: guardianPdf('2024/10/928_manual_13JUN2022.pdf') },
      { label: '928V manual', url: guardianPdf('2024/10/928V-Manual-.pdf') },
      { label: '928V service bulletin', url: guardianPdf('2025/02/928V-Service-Bulletin.pdf') },
      { label: 'Quick reference guide, 928 and 928V', url: guardianPdf('2024/10/Quick_reference_Guide_928.pdf') },
      { label: 'B5A928 instruction sheet', url: guardianPdf('2024/10/B5A928_Instruction-Sheet-211129.pdf') },
      { label: '928 exterior dimensions', url: guardianPdf('2024/10/Model-928-Exterior-Dimensions.pdf') },
    ],
    checked: '2026-11-11',
  },
  {
    id: 'guardian-commercial',
    brand: 'guardian',
    title: 'Medium-duty commercial operators: jackshaft, hoist and trolley',
    kind: 'install',
    category: 'opener',
    markets: ['commercial'],
    models: ['MDJ', 'MDH', 'MDT', 'medium duty', 'jackshaft', 'hoist', 'trolley'],
    url: GUARDIAN_MANUALS,
    docs: [
      { label: 'MDJ and MDH manual', url: guardianPdf('2025/02/MDJ-MDH-Manual-Guardian-English-16OCT2024-2-1.pdf') },
      { label: 'MDT trolley manual', url: guardianPdf('2025/06/MDT-CDO-English-09JUN2025.pdf') },
    ],
    checked: '2026-11-11',
  },
  {
    id: 'guardian-troubleshooting',
    brand: 'guardian',
    title: 'FAQs and troubleshooting: beep codes, limits, programming',
    kind: 'troubleshooting',
    category: 'opener',
    models: ['beep', 'error code', 'limits', 'force', 'photo eye', 'programming', 'keypad', 'HomeLink'],
    url: 'https://adhguardianusa.com/service/faqs-troubleshooting/',
    checked: '2026-11-10',
  },

  // Overhead Door
  {
    id: 'overhead-door-legacy-owner',
    brand: 'overhead-door',
    title: "Legacy 650 and 850 programming, operation and maintenance manual",
    kind: 'owner',
    category: 'opener',
    models: ['Legacy', 'Legacy 650', 'Legacy 850', '1029', '2029', '1029H', '2029H', 'belt', 'chain'],
    url: 'https://www.overheaddoor.com/Documents/legacy-owners-manual.pdf',
    checked: '2026-11-11',
  },
  {
    id: 'overhead-door-phantom-legacy-install',
    brand: 'overhead-door',
    title: "Phantom and Legacy chain and belt drive owner's manual (install included)",
    kind: 'install',
    category: 'opener',
    models: ['Phantom', 'Legacy', 'CD', 'CDB', '496', '696', '777-CD', 'chain', 'belt'],
    note: 'Older CD and CDB series power heads.',
    url: 'https://www.overheaddoor.com/documents/phantom-legacy-installation.pdf',
    checked: '2026-11-11',
  },
  {
    id: 'overhead-door-keypad-programming',
    brand: 'overhead-door',
    title: 'Wireless keypad programming',
    kind: 'owner',
    category: 'opener',
    models: ['CodeDodger', 'CodeDodger 2', 'OKP-BX', 'OWK-BX', 'keypad', 'programming'],
    url: 'https://www.overheaddoor.com/residential/programming-instructions/wireless-keypad-programming',
    checked: '2026-11-11',
  },

  // Commercial & gate (checked against each maker's own site, Nov 11, 2026)
  {
    id: 'liftmaster-commercial-logic5',
    brand: 'liftmaster',
    title: 'Logic 5.0 commercial operators: install manual, user\'s guide, quick start, service guide',
    kind: 'install',
    category: 'opener',
    markets: ['commercial'],
    models: ['Logic 5', 'Logic 5.0', 'T', 'APT', 'H', 'J', 'HJ', 'GH', 'GT', 'SD', 'GSD', 'DHJ', 'trolley', 'hoist', 'jackshaft'],
    note: 'From the T trolley page; these cover the other Logic 5.0 models too.',
    url: 'https://www.liftmaster.com/t-trolley-operator/p/T',
    docs: [
      { label: 'Install manual', url: liftmasterPdf('fad0xiatt0/original/01-39130.pdf') },
      { label: 'Install manual (Spanish)', url: liftmasterPdf('ibhdubcysu/original/01-39132.pdf') },
      { label: "User's guide", url: liftmasterPdf('i68obxrjtq/original/01-39049.pdf') },
      { label: "User's guide (Spanish)", url: liftmasterPdf('pqjqfxnrr5/original/01-39049SP.pdf') },
      { label: 'Quick start', url: liftmasterPdf('1gl91qwewb/original/01-36816.pdf') },
      { label: 'Quick start (Spanish)', url: liftmasterPdf('zor50hyeyp/original/01-36816SP.pdf') },
      LIFTMASTER_SERVICE_GUIDE,
    ],
    checked: '2026-11-11',
  },
  {
    id: 'liftmaster-commercial-medium-duty',
    brand: 'liftmaster',
    title: 'Medium-duty commercial operators: install manual and user\'s guides',
    kind: 'install',
    category: 'opener',
    markets: ['commercial'],
    models: ['MH', 'MJ', 'MHS', 'MGJ', 'MT', 'BMT', 'MH5011U', 'MJ5011U', 'MHS5011U', 'MGJ5011U', 'MH5011E', 'MJ5011E', 'MT5011E', '5011', 'medium duty', 'hoist', 'jackshaft'],
    url: 'https://www.liftmaster.com/mh-hoist-operator-medium-duty-door-operator/p/MH',
    docs: [
      { label: 'Install manual, MJ, MH, MHS, MGJ 5011U', url: liftmasterPdf('sav7rqm4ba/original/01-34213.pdf') },
      { label: "User's guide, MJ, MH, MHS, MGJ", url: liftmasterPdf('sgiabgk6ri/original/0134006.pdf') },
      { label: "User's guide, Logic MT, BMT, MJ, MH, MHS, MGJ 5011E", url: liftmasterPdf('kig2wlajfm/original/0134215.pdf') },
      { label: 'MGJ5011U quick start', url: liftmasterPdf('hwj5jjspwl/original/0134219.pdf') },
      LIFTMASTER_SERVICE_GUIDE,
    ],
    checked: '2026-11-11',
  },
  {
    id: 'overhead-door-rsx-install',
    brand: 'overhead-door',
    title: 'RSX commercial operator install manual (trolley)',
    kind: 'install',
    category: 'opener',
    markets: ['commercial'],
    models: ['RSX', 'trolley', 'sidemount', 'dual trolley', 'jackshaft'],
    url: 'https://www.overheaddoor.com/Documents/operator-rsx-drawbar-install.pdf',
    checked: '2026-11-11',
  },
  {
    id: 'overhead-door-rhx-install',
    brand: 'overhead-door',
    title: 'RHX commercial/industrial operator install manual (trolley)',
    kind: 'install',
    category: 'opener',
    markets: ['commercial'],
    models: ['RHX', 'trolley', 'sidemount', 'dual trolley', 'OPAKSMTHX', 'OPAKDTHX'],
    url: 'https://www.overheaddoor.com/Documents/operator-rhx-trolley-install.pdf',
    checked: '2026-11-11',
  },
  {
    id: 'overhead-door-rhx-nema',
    brand: 'overhead-door',
    title: 'RHX NEMA 7/9 explosion-proof operator install manual',
    kind: 'install',
    category: 'opener',
    markets: ['commercial'],
    models: ['RHX', 'NEMA 7', 'NEMA 9', 'explosion proof', 'hoist', 'trolley'],
    url: 'https://www.overheaddoor.com/Documents/operator-rhx-nema-manual.pdf',
    checked: '2026-11-11',
  },
  {
    id: 'linear-mo-s',
    brand: 'linear',
    title: 'MO-S commercial door operator install and owner\'s manual',
    kind: 'install',
    category: 'opener',
    markets: ['commercial'],
    models: ['MO-S', 'MO', 'MOS', 'solid state', 'commercial'],
    url: 'https://linear-solutions.com/wp-content/uploads/MO-S_230770.pdf',
    checked: '2026-11-11',
  },
  {
    id: 'clopay-commercial-sectional',
    brand: 'clopay',
    title: 'Commercial and industrial sectional door install manual',
    kind: 'install',
    category: 'door',
    markets: ['commercial'],
    models: ['commercial sectional', 'industrial', 'Safe-T chain hoist', 'chain hoist'],
    note: 'Also has the commercial supplemental instructions.',
    url: 'https://consumerservices.clopay.com/support/solutions/articles/67000612876-commercial-installation-manuals',
    checked: '2026-11-11',
  },
  // DoorKing: each model's manuals are read off its own tech-support page.
  {
    id: 'doorking-slide-gate',
    brand: 'doorking',
    title: 'Slide gate operators: all models',
    kind: 'library',
    category: 'gate',
    models: ['2170', 'eVolve', '1175', 'slide gate'],
    note: 'Pick the model, then the manual that matches the date it was built.',
    url: `${DOORKING_SUPPORT}slide-gate-operator/`,
    checked: '2026-11-11',
  },
  {
    id: 'doorking-6050-6100',
    brand: 'doorking',
    title: "6050 and 6100 swing gate operator: owner's manuals and quick start",
    kind: 'owner',
    category: 'gate',
    models: ['6050', '6100', 'swing gate'],
    note: 'Pick the owner\'s manual that matches the date on the operator\'s label.',
    url: `${DOORKING_SUPPORT}swing-gate-operator/6050-6100-residential-and-commercial/`,
    docs: [
      { label: 'Quick start', url: doorkingPdf('2016/02/6050-066-T-9-24_QS_11x17.pdf') },
      ...doorkingByBuild('6050/6100', '2018/08/6050-065-Z-9-24.pdf', '2018/05/6050-065-N-5-18.pdf', '2016/01/6050-065-B-6-15.pdf'),
    ],
    checked: '2026-11-11',
  },
  {
    id: 'doorking-6500',
    brand: 'doorking',
    title: "6500 swing gate operator: owner's manuals and quick start",
    kind: 'owner',
    category: 'gate',
    models: ['6500', 'swing gate'],
    note: 'Pick the owner\'s manual that matches the date on the operator\'s label.',
    url: `${DOORKING_SUPPORT}swing-gate-operator/6500-commercial-and-industrial/`,
    docs: [
      { label: 'Quick start', url: doorkingPdf('2021/10/6500-066-U-10-21_Quickstart_11x17.pdf') },
      ...doorkingByBuild('6500', '2018/08/6500-065-V-9-24.pdf', '2018/05/6500-065-H-5-18.pdf', '2014/03/6500-065-W-3-14.pdf'),
    ],
    checked: '2026-11-11',
  },
  {
    id: 'doorking-6550',
    brand: 'doorking',
    title: "6550 and 6555 swing gate operators: owner's manuals",
    kind: 'owner',
    category: 'gate',
    models: ['6550', '6555', 'swing gate'],
    url: `${DOORKING_SUPPORT}swing-gate-operator/6550-commercial-and-industrial/`,
    docs: [
      { label: "6550 owner's manual, built Aug 2018 to now", url: doorkingPdf('2018/08/6550-065-Y-9-24.pdf') },
      { label: "6555 owner's manual, built Aug 2018 to now", url: doorkingPdf('2018/08/6555-065-G-9-24.pdf') },
    ],
    checked: '2026-11-11',
  },
  {
    id: 'doorking-6004',
    brand: 'doorking',
    title: "6004 column mount operator and 4302 control box: owner's manuals",
    kind: 'owner',
    category: 'gate',
    models: ['6004', '4302', 'column mount', 'swing gate', 'control box'],
    note: 'Older 4302 control box manuals are on the maker\'s page.',
    url: `${DOORKING_SUPPORT}swing-gate-operator/6004-column-mount-swing-gate-operator/`,
    docs: [
      { label: '6004 quick start', url: doorkingPdf('2021/01/6004-066-K-1-21_Quickstart_11x17.pdf') },
      ...doorkingByBuild('6004', '2018/08/6004-065-Z-9-24.pdf', '2018/05/6004-065-Q-5-18.pdf', '2013/09/6004-065-E-5-12.pdf'),
      { label: "4302 AC control box owner's manual, built Aug 2018 to now", url: doorkingPdf('2020/04/4302-065-L-1-25.pdf') },
      { label: "4302 solar control box owner's manual, built Aug 2018 to now", url: doorkingPdf('2020/04/4302-067-M-5-26.pdf') },
      { label: '4302 solar control box quick start', url: doorkingPdf('2021/02/4302-068-V-2-21_Quickstart_Solar_11x17.pdf') },
    ],
    checked: '2026-11-11',
  },
  {
    id: 'doorking-9000',
    brand: 'doorking',
    title: "9000 slide gate operator: owner's manuals and quick start",
    kind: 'owner',
    category: 'gate',
    models: ['9000', 'slide gate'],
    note: 'Pick the owner\'s manual that matches the date on the operator\'s label.',
    url: `${DOORKING_SUPPORT}slide-gate-operator/9000-commercial-and-industrial/`,
    docs: [
      { label: 'Quick start', url: doorkingPdf('2018/08/9000-066-P-9-24_QS_11x17.pdf') },
      ...doorkingByBuild('9000', '2018/08/9000-065-P-9-24.pdf', '2018/05/9000-065-B-5-18.pdf', '2014/04/9000-065-N-4-14.pdf'),
      { label: "9000 owner's manual (French)", url: doorkingPdf('2014/03/9000-065-H-3-11-FR.pdf') },
    ],
    checked: '2026-11-11',
  },
  {
    id: 'doorking-9024',
    brand: 'doorking',
    title: "9024 slide gate operator, AC and solar: owner's manuals",
    kind: 'owner',
    category: 'gate',
    models: ['9024', 'solar', 'slide gate'],
    note: 'Pick the owner\'s manual that matches the power type and the date on the operator\'s label.',
    url: `${DOORKING_SUPPORT}slide-gate-operator/9024-commercial-and-industrial/`,
    docs: [
      ...doorkingByBuild('9024 AC', '2018/08/9024-065-S-7-25.pdf', '2018/05/9024-065-Z-5-18_AC_Power.pdf', '2015/02/9024-065-H-1-15_AC_Power.pdf'),
      ...doorkingByBuild('9024 solar', '2018/08/9024-066-J-2-26.pdf', '2018/05/9024-066-T-5-18_Solar_Power.pdf', '2015/02/9024-066-A-1-15_Solar_Power.pdf'),
    ],
    checked: '2026-11-11',
  },
  {
    id: 'doorking-9050',
    brand: 'doorking',
    title: "9050 slide gate operator: owner's manuals and quick start",
    kind: 'owner',
    category: 'gate',
    models: ['9050', 'slide gate'],
    note: 'Pick the owner\'s manual that matches the date on the operator\'s label.',
    url: `${DOORKING_SUPPORT}slide-gate-operator/9050-residential/`,
    docs: [
      { label: 'Quick start', url: doorkingPdf('2018/08/9050-066-R-9-24_QS_11x17.pdf') },
      ...doorkingByBuild('9050', '2018/08/9050-065-T-11-25.pdf', '2018/05/9050-065-F-5-18.pdf', '2014/04/9050-065-U-4-14.pdf'),
    ],
    checked: '2026-11-11',
  },
  {
    id: 'doorking-9100',
    brand: 'doorking',
    title: "9100 slide gate operator: owner's manuals and quick start",
    kind: 'owner',
    category: 'gate',
    models: ['9100', 'slide gate'],
    note: 'Pick the owner\'s manual that matches the date on the operator\'s label.',
    url: `${DOORKING_SUPPORT}slide-gate-operator/9100-commercial/`,
    docs: [
      { label: 'Quick start', url: doorkingPdf('2018/08/9100-066-T-9-24_QS_11x17.pdf') },
      ...doorkingByBuild('9100', '2018/08/9100-065-D-9-24.pdf', '2018/05/9100-065-P-5-18.pdf', '2014/04/9100-065-A-4-14.pdf'),
    ],
    checked: '2026-11-11',
  },
  {
    id: 'doorking-9150',
    brand: 'doorking',
    title: "9150 slide gate operator: owner's manuals and quick start",
    kind: 'owner',
    category: 'gate',
    models: ['9150', 'slide gate'],
    note: 'Pick the owner\'s manual that matches the date on the operator\'s label.',
    url: `${DOORKING_SUPPORT}slide-gate-operator/9150-commercial-and-industrial/`,
    docs: [
      { label: 'Quick start', url: doorkingPdf('2018/08/9150-066-T-9-24_QS_11x17.pdf') },
      ...doorkingByBuild('9150', '2018/08/9150-065-C-9-24.pdf', '2018/05/9150-065-M-5-18.pdf', '2014/04/9150-065-X-4-14.pdf'),
    ],
    checked: '2026-11-11',
  },
  {
    id: 'doorking-9200',
    brand: 'doorking',
    title: "9200 series slide gate operators: owner's manuals and quick starts",
    kind: 'owner',
    category: 'gate',
    models: ['9200', '9210', '9240', '9245', 'slide gate'],
    note: 'Pick the owner\'s manual that matches the date on the operator\'s label.',
    url: `${DOORKING_SUPPORT}slide-gate-operator/9200-series/`,
    docs: [
      { label: '9200 quick start', url: doorkingPdf('2018/08/9210-066-R-9-24_QS_11x17.pdf') },
      { label: '9240 quick start', url: doorkingPdf('2018/08/9240-066-R-9-24_QS_11x17.pdf') },
      ...doorkingByBuild('9200 series', '2018/08/9210-065-Z-4-26.pdf', '2018/05/9210-065-E-5-18.pdf', '2015/09/9210-065-R-9-15.pdf'),
      { label: "9245 owner's manual, built Nov 2017 to now", url: doorkingPdf('2018/08/9245-065-T-9-24.pdf') },
    ],
    checked: '2026-11-11',
  },
  {
    id: 'doorking-9500',
    brand: 'doorking',
    title: "9500 maximum security slide gate operator: owner's manuals",
    kind: 'owner',
    category: 'gate',
    models: ['9500', '9510', 'maximum security', 'slide gate'],
    note: 'Pick the owner\'s manual that matches the date on the operator\'s label.',
    url: `${DOORKING_SUPPORT}slide-gate-operator/9500-maximum-security/`,
    docs: [
      { label: 'Quick start', url: doorkingPdf('2020/09/9500-066-P-8-20_Quickstart_11x17_0.pdf') },
      ...doorkingByBuild('9500 series', '2018/08/9510-065-P-9-24.pdf', '2018/06/9510-065-W-5-18.pdf', '2013/09/9510-065-L-3-13.pdf'),
    ],
    checked: '2026-11-11',
  },
  {
    id: 'doorking-swing-gate',
    brand: 'doorking',
    title: 'Swing gate operators: all models',
    kind: 'library',
    category: 'gate',
    models: ['6006', '6300', '6524', '2160', '6400', 'eVolve', 'swing gate'],
    note: 'Pick the model, then the manual that matches the date it was built.',
    url: `${DOORKING_SUPPORT}swing-gate-operator/`,
    checked: '2026-11-11',
  },
  {
    id: 'doorking-entry-systems',
    brand: 'doorking',
    title: 'Telephone and video entry systems',
    kind: 'library',
    category: 'gate',
    models: ['1802', '1803', '1808', '1810', '1812', '1816', '1819', '1820', '1833', '1834', '1835', '1837', '1838', '2108', '2112', 'Access Plus', 'telephone entry', 'intercom', 'call box'],
    url: 'https://www.doorking.com/tech-support/telephone/',
    checked: '2026-11-11',
  },
  {
    id: 'doorking-traffic-control',
    brand: 'doorking',
    title: 'Barrier gates and traffic control',
    kind: 'library',
    category: 'gate',
    models: ['1601', '1602', '1603', '1610', '1620', '1625', '1175', 'barrier gate', 'parking', 'AutoSpikes', 'traffic spikes', 'overhead gate'],
    url: 'https://www.doorking.com/tech-support/traffic-control/',
    checked: '2026-11-11',
  },
  {
    id: 'rytec-documents',
    brand: 'rytec',
    title: 'Document resource center: owner\'s and install manuals',
    kind: 'library',
    category: 'door',
    markets: ['commercial'],
    models: ['Spiral', 'Spiral FV', 'Spiral HZ', 'Spiral LH', 'Spiral LP', 'Spiral VP', 'Spiral VT', 'Turbo-Seal', 'Turbo-Slide', 'Fast-Seal', 'Clean-Roll', 'Pharma-Seal', 'Plexline', 'PredaDoor', 'PredaCool', 'Sure-Seal', 'FlexTec', 'Bantam', 'PowerTec', 'high speed', 'technical bulletin'],
    note: 'Filter by product and pick Owner\'s or Installation Manuals.',
    url: 'https://www.rytecdoors.com/resources',
    checked: '2026-11-11',
  },
  {
    id: 'cornell-cookson-300',
    brand: 'cornell-cookson',
    title: '300 Series rolling door install instructions',
    kind: 'install',
    category: 'door',
    markets: ['commercial'],
    models: ['300', '300 Series', 'Extreme 300', 'rolling', 'APEX Pro'],
    url: 'https://clopay.cornellcookson.com/docs/architectportallibraries/commercial-install-manuals/300-door-install-manual912be02433ce40ed8d844ea8f3d05703.pdf',
    checked: '2026-11-11',
  },
  {
    id: 'cornell-cookson-1024',
    brand: 'cornell-cookson',
    title: '1024 high-cycle rolling door install instructions',
    kind: 'install',
    category: 'door',
    markets: ['commercial'],
    models: ['1024', 'HSHC', 'high cycle', 'rolling', 'APEX Pro', 'Micanan'],
    url: 'https://clopay.cornellcookson.com/docs/architectportallibraries/commercial-install-manuals/1024-door-install-manual.pdf',
    checked: '2026-11-11',
  },
  // Chase Doors: every PDF below is linked from chasedoors.com's install instructions page.
  {
    id: 'chase-install',
    brand: 'chase',
    title: 'All install instructions: traffic, cold storage, strip, roll-up, curtains',
    kind: 'library',
    category: 'door',
    markets: ['commercial'],
    models: ['strip door', 'traffic door', 'cold storage', 'dock bumper', 'security gate', 'Tri Lite', 'hinge guard', 'weld plate', 'frame', 'EcoAccess'],
    url: CHASE_INSTALL,
    checked: '2026-11-11',
  },
  {
    id: 'chase-traffic',
    brand: 'chase',
    title: 'Traffic doors: Proline, Durulite, Retailer and R25 install instructions',
    kind: 'install',
    category: 'door',
    markets: ['commercial'],
    models: ['Proline', '300i', '400i', '300s', '400s', 'Durulite', 'Retailer', 'Retailer XHD', 'R25', 'Target', 'traffic door', 'impact door'],
    url: CHASE_INSTALL,
    docs: [
      { label: 'Proline 300i and 400i', url: chasePdf('Traffic-and-Impact/proline_300i_400i_traffic_door10-instruction-44.pdf') },
      { label: 'Proline 300s and 400s', url: chasePdf('Traffic-and-Impact/proline_300i_400i_traffic_door10-instruction-12.pdf') },
      { label: 'Proline 300s and 400s (Spanish)', url: chasePdf('Traffic-and-Impact/proline_300i_400i_traffic_door10-instruction-45.pdf') },
      { label: 'Proline 300s and 400s with weld plates', url: chasePdf('Traffic-and-Impact/proline_300i_400i_traffic_door10-instruction-150.pdf') },
      { label: 'Durulite industrial standard and security door, 2022', url: chasePdf('Durulite-Industrial-Standard-and-Security-Door-Top-Seal-Installation-Instructions-Updated-2-14-2022.pdf') },
      { label: 'Durulite standard with combo lower hinge guard, 2022', url: chasePdf('Durulite-Standard-with-Industrial-Combo-Lower-Hinge-Guard-Installation-Instructions-Updated-2-14-2022.pdf') },
      { label: 'Durulite Retailer XHD', url: chasePdf('Traffic-and-Impact/durulite_retailer_xhd_installation_instructions.pdf') },
      { label: 'Durulite Retailer XHD extended', url: chasePdf('Traffic-and-Impact/retailer_xhd_extended_installation_instructions.pdf') },
      { label: 'Retailer, 2022', url: chasePdf('Retailer-Installation-Instructions-Updated-2-14-2022.pdf') },
      { label: 'R25, 2022', url: chasePdf('R25-Installation-Instructions-Updated-2-14-2022.pdf') },
    ],
    checked: '2026-11-11',
  },
  {
    id: 'chase-coldguard',
    brand: 'chase',
    title: 'ColdGuard cold storage doors and 1900-RLS operator',
    kind: 'install',
    category: 'door',
    markets: ['commercial'],
    models: ['ColdGuard', 'VLE', 'SSE-EHD', 'BPE-EHD', 'SSM-EHD', 'SSM-SD', 'BPM-EHD', '1900-RLS', '1900 RLS', 'RLS', 'E-Z operator', 'cold storage', 'freezer', 'cooler', 'sliding'],
    url: CHASE_INSTALL,
    docs: [
      { label: '1900-RLS operator install and owner manual', url: chasePdf('Cold-Storage/coldguard_sliding_cold_storage_doors68-instruction-402.pdf') },
      { label: 'VLE vertical lift door', url: chasePdf('Cold-Storage/Vertical-Lift-Door/coldguard_vertical_lift_cold_storage_door70-instruction-212.pdf') },
      { label: 'Single or double swing door', url: chasePdf('Cold-Storage/coldguard_swing_cold_storage_door69-instruction-181.pdf') },
      { label: 'SSE-EHD single sliding door', url: chasePdf('Cold-Storage/coldguard_sliding_cold_storage_doors68-instruction-209.pdf') },
      { label: 'SSE-EHD with E-Z operator', url: chasePdf('Cold-Storage/coldguard_sliding_cold_storage_doors68-instruction-411.pdf') },
      { label: 'SSE-EHD with 1900-RLS', url: chasePdf('Cold-Storage/coldguard_sliding_cold_storage_doors68-instruction-410.pdf') },
      { label: 'BPE-EHD bi-part with 1900-RLS, freezer', url: chasePdf('Cold-Storage/coldguard_sliding_cold_storage_doors68-instruction-409.pdf') },
      { label: 'BPE-EHD bi-part, anti-lift', url: chasePdf('Cold-Storage/bpe-ehd-gt_installation_manual_anti_lift.pdf') },
      { label: 'BPM-EHD bi-part, under-panel guide anti-lift', url: chasePdf('Cold-Storage/bpm-ehd_installation_manual_under_panel_guide_anti_lift.pdf') },
      { label: 'SSM-EHD single sliding manual door', url: chasePdf('Cold-Storage/coldguard_sliding_cold_storage_doors68-instruction-403.pdf') },
      { label: 'SSM-SD single sliding manual door', url: chasePdf('Cold-Storage/coldguard_sliding_cold_storage_doors68-instruction-404.pdf') },
      { label: 'SSM-SD with under-panel guide anti-lift', url: chasePdf('SSM-SD-INSTALLATION-MANUAL-WITH-UNDER-PANEL-GUIDEANTILIFT-8.10.21.pdf') },
    ],
    checked: '2026-11-11',
  },
  {
    id: 'chase-sliding-roll-up',
    brand: 'chase',
    title: 'Sliding fire door operators and Screen-Pro roll-up screens',
    kind: 'install',
    category: 'door',
    markets: ['commercial'],
    models: ['1900-PLC', 'F1900-PLC', 'Saino', 'fire door', 'Screen-Pro', 'screen', 'bug screen', 'roll-up', 'chain hoist', 'jackshaft'],
    url: CHASE_INSTALL,
    docs: [
      { label: 'Saino 1900-PLC operator', url: chasePdf('Sliding/saino_operator_1900plc46-instruction-325.pdf') },
      { label: 'F1900-PLC 3rd generation', url: chasePdf('Sliding/f1900-plc_3rd_generation_rev_11-16_1.pdf') },
      { label: 'Screen-Pro in-jamb', url: chasePdf('Roll-Up/screen_pro_injamb_install.pdf') },
      { label: 'Screen-Pro chain hoist, wall mount', url: chasePdf('Roll-Up/screen_pro_chain_install.pdf') },
      { label: 'Screen-Pro in-tube motor, wall mount', url: chasePdf('Roll-Up/screen_pro_jackshaft_install.pdf') },
      { label: 'Screen-Pro external motor, wall mount', url: chasePdf('Roll-Up/screen_pro_wall_install.pdf') },
      { label: 'Screen-Pro spring loaded, standoff mount', url: chasePdf('Roll-Up/screen_pro_standoff_install.pdf') },
      { label: 'Screen-Pro slider', url: chasePdf('Roll-Up/screen_pro_slider_install.pdf') },
    ],
    checked: '2026-11-11',
  },
  {
    id: 'chase-strip-flex',
    brand: 'chase',
    title: 'Strip, flexible and curtain doors install instructions',
    kind: 'install',
    category: 'door',
    markets: ['commercial'],
    models: ['AirGard', 'EconoClear', 'Econotrac', 'Polar-Pro', 'flexible door', 'flex door', 'strip door', 'PVC', 'curtain', 'weld screen', 'J-hook'],
    url: CHASE_INSTALL,
    docs: [
      { label: 'Flexible door', url: chasePdf('FLEX-DOOR-INSTALLATION-INSTRUCTIONS-v4.pdf') },
      { label: 'Polar-Pro', url: chasePdf('Flexible/polar_pro_install.pdf') },
      { label: 'EconoClear', url: chasePdf('Flexible/airgard_econoclear_flexible_door27-instruction-149.pdf') },
      { label: 'Econotrac', url: chasePdf('Strip-and-PVC/econotrac_installation_instructions.pdf') },
      { label: 'Personnel strip door', url: chasePdf('Strip-and-PVC/PSD-Instructions.pdf') },
      { label: 'J-hook bi-mount', url: chasePdf('Strip-and-PVC/j-hook_bi-mount_installation_instructions.pdf') },
      { label: 'Curtain, wall mount', url: chasePdf('Curtains/CurtainInstallationInstructionsWallMount.pdf') },
      { label: 'Curtain, ceiling mount', url: chasePdf('Curtains/CurtainInstallationInstructionsCeilingMount.pdf') },
    ],
    checked: '2026-11-11',
  },
  {
    id: 'bea-lzr-h100',
    brand: 'bea',
    title: 'LZR-H100 gate and barrier safety sensor user guides',
    kind: 'owner',
    category: 'gate',
    models: ['LZR-H100', 'H100', 'laser scanner', 'sliding gate', 'swing gate', 'barrier arm'],
    url: 'https://us.beasensors.com/en/product/lzr-h100/downloads/',
    docs: [
      { label: 'User guide', url: beaPdf('75.5984.08.EN-LZR-H100-20250507.pdf') },
      { label: 'Quick guide, sliding gates', url: beaPdf('75.0100.01.EN-LZR-H100-QG-Sliding-Gates-20250507.pdf') },
      { label: 'Quick guide, swing gates', url: beaPdf('75.0101.01.EN-LZR-H100-QG-Swing-Gates-20250507.pdf') },
      { label: 'Quick guide, barrier arms', url: beaPdf('75.0099.01.EN-LZR-H100-QG-Barrier-Arms-20250507.pdf') },
    ],
    checked: '2026-11-11',
  },
];
