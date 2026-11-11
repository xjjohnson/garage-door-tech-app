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
  url: string;
  /** The day someone last opened the link and saw it load, as YYYY-MM-DD. */
  checked: string;
}

export const BRANDS: Brand[] = [
  { id: 'clopay', name: 'Clopay', aliases: [], makes: ['door'], hosts: ['www.clopaydoor.com', 'consumerservices.clopay.com'] },
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
  },
  {
    id: 'bea',
    name: 'BEA',
    aliases: ['BEA Sensors'],
    makes: ['gate'],
    hosts: ['us.beasensors.com'],
  },
];

export const MANUAL_LINKS: ManualLink[] = [
  // Clopay
  {
    id: 'clopay-residential-support',
    brand: 'clopay',
    title: 'Residential install instructions, supplements and care manuals',
    kind: 'library',
    category: 'door',
    models: ['Avante', 'Canyon Ridge', 'Grand Harbor', 'Coachman', 'VertiStack', 'insulated steel', '1-layer', '2-layer', 'wood', 'torsion spring', 'EZ-SET', 'WindCode', 'low headroom'],
    note: 'Install instructions, spring and opener supplements, WindCode supplements and care manuals, all on one page.',
    url: 'https://www.clopaydoor.com/residential/support',
    checked: '2026-11-10',
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

  // Linear
  {
    id: 'linear-manuals',
    brand: 'linear',
    title: 'Garage door and gate operator manuals',
    kind: 'library',
    category: 'opener',
    models: ['LDO33', 'LDO50', 'LSO50', 'LDCO801', 'LDCO841', 'LDCO850', 'LDCO852', 'LDCO863', 'LCO75', 'commercial'],
    note: 'Install and homeowner manuals for each model on one page.',
    url: 'https://linear-solutions.com/manuals/',
    checked: '2026-11-10',
  },
  {
    id: 'linear-gate-manuals',
    brand: 'linear',
    title: 'Gate operator manuals',
    kind: 'library',
    category: 'gate',
    models: ['gate', 'BGU', 'BGUS', 'GPX-SL25', 'GSLG', 'HSLG', 'SW2000XLS', 'SW3000XLS', 'SW4000XLS', 'SG', 'SL-2000B', 'SLC', 'SLD-211', 'SLR', 'SWC', 'SWD-211', 'SWR', 'SWG', 'VS-GSLG', 'VS-GSWG', 'MO'],
    note: 'Gate openers are further down the same page.',
    url: 'https://linear-solutions.com/manuals/',
    checked: '2026-11-10',
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

  // Guardian
  {
    id: 'guardian-manuals',
    brand: 'guardian',
    title: 'Opener manuals',
    kind: 'library',
    category: 'opener',
    models: ['315', '415', '415-3T', '425', '428', '600SL', '615', '628', '628FCA', '715', '715BBU', '7160V', '7280V', '728B', '928', '928V', '4150V'],
    url: 'https://adhguardianusa.com/service/manuals/',
    checked: '2026-11-10',
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
    title: 'Logic 5.0 commercial operators: install manual, user\'s guide, service guide',
    kind: 'install',
    category: 'opener',
    markets: ['commercial'],
    models: ['Logic 5', 'Logic 5.0', 'T', 'APT', 'H', 'J', 'HJ', 'GH', 'GT', 'SD', 'GSD', 'DHJ', 'trolley', 'hoist', 'jackshaft'],
    note: 'Manuals are under Installation & Support on the T trolley page; they cover the other Logic 5.0 models too.',
    url: 'https://www.liftmaster.com/t-trolley-operator/p/T',
    checked: '2026-11-11',
  },
  {
    id: 'liftmaster-commercial-medium-duty',
    brand: 'liftmaster',
    title: 'Medium-duty commercial operators: install manual and user\'s guide',
    kind: 'install',
    category: 'opener',
    markets: ['commercial'],
    models: ['MH', 'MJ', 'MHS', 'MGJ', 'MT', 'BMT', 'MH5011U', 'MJ5011U', 'MHS5011U', 'MGJ5011U', '5011', 'medium duty', 'hoist', 'jackshaft'],
    url: 'https://www.liftmaster.com/mh-hoist-operator-medium-duty-door-operator/p/MH',
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
  {
    id: 'doorking-slide-gate',
    brand: 'doorking',
    title: 'Slide gate operators: owner\'s manuals by model',
    kind: 'library',
    category: 'gate',
    models: ['9000', '9024', '9050', '9100', '9150', '9200', '9500', '2170', 'eVolve', 'slide gate'],
    note: 'Pick the model, then the manual that matches the date it was built.',
    url: 'https://www.doorking.com/tech-support/slide-gate-operator/',
    checked: '2026-11-11',
  },
  {
    id: 'doorking-swing-gate',
    brand: 'doorking',
    title: 'Swing gate operators: owner\'s manuals by model',
    kind: 'library',
    category: 'gate',
    models: ['6004', '6006', '6050', '6100', '6300', '6500', '6524', '6550', '2160', 'eVolve', 'swing gate'],
    url: 'https://www.doorking.com/tech-support/swing-gate-operator/',
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
  {
    id: 'chase-install',
    brand: 'chase',
    title: 'Install instructions: traffic, cold storage, strip and roll-up doors',
    kind: 'library',
    category: 'door',
    markets: ['commercial'],
    models: ['Durulite', 'Retailer', 'R25', 'Proline', '300i', '400i', '300s', '400s', 'ColdGuard', 'VLE', 'SSE-EHD', 'BPE-EHD', 'SSM-EHD', 'BPM-EHD', '1900-RLS', '1900-PLC', 'F1900-PLC', 'Screen-Pro', 'AirGard', 'strip door', 'traffic door', 'cold storage'],
    url: 'https://www.chasedoors.com/resources/installation-instructions',
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
    checked: '2026-11-11',
  },
];
