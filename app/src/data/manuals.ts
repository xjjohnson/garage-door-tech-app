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
  url: string;
  /** The day someone last opened the link and saw it load, as YYYY-MM-DD. */
  checked: string;
}

export const BRANDS: Brand[] = [
  { id: 'clopay', name: 'Clopay', aliases: [], makes: ['door'], hosts: ['www.clopaydoor.com'] },
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

  // C.H.I.
  {
    id: 'chi-document-finder',
    brand: 'chi',
    title: 'Document finder',
    kind: 'library',
    category: 'door',
    models: ['Planks', 'Sterling', 'Skyline', 'Shoreline', 'carriage house', 'raised panel', 'shaker', 'full view', 'recessed panel'],
    note: 'Search by door name, then pick the file type.',
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
];
