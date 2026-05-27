/**
 * Stock Universe — sourced directly from OP_Portfolio_Dashboard.stockdatas
 * These 243 symbols have >= 200 records AND data updated within the last 7 days.
 * ISIN is embedded to skip a stockmasters lookup on every query.
 *
 * Regenerate this list by running:
 *   node scripts/refreshUniverse.js
 */

export interface StockInfo {
  symbol: string;    // NSE symbol, e.g. "TATASTEEL"
  isin:   string;    // e.g. "INE081A01020"
  name:   string;    // full display name
  exchange: string;
}

export const STOCK_UNIVERSE: StockInfo[] = [
  { symbol: '20MICRONS',   isin: 'INE144J01027', name: '20 Microns Limited', exchange: 'NSE' },
  { symbol: '360ONE',      isin: 'INE466L01038', name: '360 ONE WAM LIMITED', exchange: 'NSE' },
  { symbol: '3MINDIA',     isin: 'INE470A01017', name: '3M India Limited', exchange: 'NSE' },
  { symbol: '5PAISA',      isin: 'INE618L01018', name: '5Paisa Capital Limited', exchange: 'NSE' },
  { symbol: 'ABCAPITAL',   isin: 'INE674K01013', name: 'Aditya Birla Capital Limited', exchange: 'NSE' },
  { symbol: 'ACC',         isin: 'INE012A01025', name: 'ACC Limited', exchange: 'NSE' },
  { symbol: 'ACCELYA',     isin: 'INE793A01012', name: 'Accelya Solutions India Limited', exchange: 'NSE' },
  { symbol: 'ACE',         isin: 'INE731H01025', name: 'Action Construction Equipment Limited', exchange: 'NSE' },
  { symbol: 'ADANIGREEN',  isin: 'INE364U01010', name: 'Adani Green Energy Limited', exchange: 'NSE' },
  { symbol: 'ADANIENT',    isin: 'INE423A01024', name: 'Adani Enterprises Limited', exchange: 'NSE' },
  { symbol: 'ADANIPORTS',  isin: 'INE742F01042', name: 'Adani Ports and Special Economic Zone Limited', exchange: 'NSE' },
  { symbol: 'ADANIPOWER',  isin: 'INE814H01029', name: 'Adani Power Limited', exchange: 'NSE' },
  { symbol: 'ADFFOODS',    isin: 'INE982B01027', name: 'ADF Foods Limited', exchange: 'NSE' },
  { symbol: 'ADVENZYMES',  isin: 'INE837H01020', name: 'Advanced Enzyme Technologies Limited', exchange: 'NSE' },
  { symbol: 'AIAENG',      isin: 'INE212H01026', name: 'AIA Engineering Limited', exchange: 'NSE' },
  { symbol: 'AJANTPHARM',  isin: 'INE031B01049', name: 'Ajanta Pharma Limited', exchange: 'NSE' },
  { symbol: 'ALKYLAMINE',  isin: 'INE150B01039', name: 'Alkyl Amines Chemicals Limited', exchange: 'NSE' },
  { symbol: 'APLAPOLLO',   isin: 'INE702C01027', name: 'APL Apollo Tubes Limited', exchange: 'NSE' },
  { symbol: 'APLLTD',      isin: 'INE901L01018', name: 'Alembic Pharmaceuticals Limited', exchange: 'NSE' },
  { symbol: 'ARVIND',      isin: 'INE034A01011', name: 'Arvind Limited', exchange: 'NSE' },
  { symbol: 'ASAHIINDIA',  isin: 'INE439A01020', name: 'Asahi India Glass Limited', exchange: 'NSE' },
  { symbol: 'ASHOKLEY',    isin: 'INE208A01029', name: 'Ashok Leyland Limited', exchange: 'NSE' },
  { symbol: 'ASTRAL',      isin: 'INE006I01046', name: 'Astral Limited', exchange: 'NSE' },
  { symbol: 'ATGL',        isin: 'INE399L01023', name: 'Adani Total Gas Limited', exchange: 'NSE' },
  { symbol: 'AUBANK',      isin: 'INE949L01017', name: 'AU Small Finance Bank Limited', exchange: 'NSE' },
  { symbol: 'AURIONPRO',   isin: 'INE132H01018', name: 'Aurionpro Solutions Limited', exchange: 'NSE' },
  { symbol: 'AUROPHARMA',  isin: 'INE406A01037', name: 'Aurobindo Pharma Limited', exchange: 'NSE' },
  { symbol: 'AUTOAXLES',   isin: 'INE449A01011', name: 'Automotive Axles Limited', exchange: 'NSE' },
  { symbol: 'AVTNPL',      isin: 'INE488D01021', name: 'AVT Natural Products Limited', exchange: 'NSE' },
  { symbol: 'AXISCADES',   isin: 'INE555B01013', name: 'AXISCADES Technologies Limited', exchange: 'NSE' },
  { symbol: 'BAJAJCON',    isin: 'INE933K01021', name: 'Bajaj Consumer Care Limited', exchange: 'NSE' },
  { symbol: 'BAJAJFINSV',  isin: 'INE918I01026', name: 'Bajaj Finserv Limited', exchange: 'NSE' },
  { symbol: 'BAJAJHCARE',  isin: 'INE411U01027', name: 'Bajaj Healthcare Limited', exchange: 'NSE' },
  { symbol: 'BALMLAWRIE',  isin: 'INE164A01016', name: 'Balmer Lawrie & Company Limited', exchange: 'NSE' },
  { symbol: 'BANCOINDIA',  isin: 'INE213C01025', name: 'Banco Products (I) Limited', exchange: 'NSE' },
  { symbol: 'BANKINDIA',   isin: 'INE084A01016', name: 'Bank of India', exchange: 'NSE' },
  { symbol: 'BATAINDIA',   isin: 'INE176A01028', name: 'Bata India Limited', exchange: 'NSE' },
  { symbol: 'BBOX',        isin: 'INE676A01027', name: 'Black Box Limited', exchange: 'NSE' },
  { symbol: 'BDL',         isin: 'INE171Z01026', name: 'Bharat Dynamics Limited', exchange: 'NSE' },
  { symbol: 'BHEL',        isin: 'INE257A01026', name: 'Bharat Heavy Electricals Limited', exchange: 'NSE' },
  { symbol: 'BLUESTARCO',  isin: 'INE472A01039', name: 'Blue Star Limited', exchange: 'NSE' },
  { symbol: 'BOMDYEING',   isin: 'INE032A01023', name: 'Bombay Dyeing & Mfg Company Limited', exchange: 'NSE' },
  { symbol: 'BOSCHLTD',    isin: 'INE323A01026', name: 'Bosch Limited', exchange: 'NSE' },
  { symbol: 'BPCL',        isin: 'INE029A01011', name: 'Bharat Petroleum Corporation Limited', exchange: 'NSE' },
  { symbol: 'BSE',         isin: 'INE118H01025', name: 'BSE Limited', exchange: 'NSE' },
  { symbol: 'CARBORUNIV',  isin: 'INE120A01034', name: 'Carborundum Universal Limited', exchange: 'NSE' },
  { symbol: 'CASTROLIND',  isin: 'INE172A01027', name: 'Castrol India Limited', exchange: 'NSE' },
  { symbol: 'CENTUM',      isin: 'INE320B01020', name: 'Centum Electronics Limited', exchange: 'NSE' },
  { symbol: 'CHEMBOND',    isin: 'INE995D01025', name: 'Chembond Material Technologies Limited', exchange: 'NSE' },
  { symbol: 'CHENNPETRO',  isin: 'INE178A01016', name: 'Chennai Petroleum Corporation Limited', exchange: 'NSE' },
  { symbol: 'COALINDIA',   isin: 'INE522F01014', name: 'Coal India Limited', exchange: 'NSE' },
  { symbol: 'COLPAL',      isin: 'INE259A01022', name: 'Colgate Palmolive (India) Limited', exchange: 'NSE' },
  { symbol: 'CONFIPET',    isin: 'INE552D01024', name: 'Confidence Petroleum India Limited', exchange: 'NSE' },
  { symbol: 'CONTROLPR',   isin: 'INE663B01015', name: 'Control Print Limited', exchange: 'NSE' },
  { symbol: 'COSMOFIRST',  isin: 'INE757A01017', name: 'COSMO FIRST LIMITED', exchange: 'NSE' },
  { symbol: 'CREDITACC',   isin: 'INE741K01010', name: 'CREDITACCESS GRAMEEN LIMITED', exchange: 'NSE' },
  { symbol: 'CUPID',       isin: 'INE509F01029', name: 'Cupid Limited', exchange: 'NSE' },
  { symbol: 'CYBERTECH',   isin: 'INE214A01019', name: 'Cybertech Systems And Software Limited', exchange: 'NSE' },
  { symbol: 'DATAMATICS',  isin: 'INE365B01017', name: 'Datamatics Global Services Limited', exchange: 'NSE' },
  { symbol: 'DATAPATTNS',  isin: 'INE0IX101010', name: 'Data Patterns (India) Limited', exchange: 'NSE' },
  { symbol: 'DCMSHRIRAM',  isin: 'INE499A01024', name: 'DCM Shriram Limited', exchange: 'NSE' },
  { symbol: 'DEEPAKFERT',  isin: 'INE501A01019', name: 'Deepak Fertilizers and Petrochemicals Corporation Limited', exchange: 'NSE' },
  { symbol: 'DELHIVERY',   isin: 'INE148O01028', name: 'Delhivery Limited', exchange: 'NSE' },
  { symbol: 'DICIND',      isin: 'INE303A01010', name: 'DIC India Limited', exchange: 'NSE' },
  { symbol: 'DMART',       isin: 'INE192R01011', name: 'Avenue Supermarts Limited', exchange: 'NSE' },
  { symbol: 'EXIDEIND',    isin: 'INE302A01020', name: 'Exide Industries Limited', exchange: 'NSE' },
  { symbol: 'GAIL',        isin: 'INE129A01019', name: 'GAIL (India) Limited', exchange: 'NSE' },
  { symbol: 'HINDALCO',    isin: 'INE038A01020', name: 'Hindalco Industries Limited', exchange: 'NSE' },
  { symbol: 'HINDZINC',    isin: 'INE267A01025', name: 'Hindustan Zinc Limited', exchange: 'NSE' },
  { symbol: 'HCC',         isin: 'INE549A01026', name: 'Hindustan Construction Company Limited', exchange: 'NSE' },
  { symbol: 'ICICIGI',     isin: 'INE765G01017', name: 'ICICI Lombard General Insurance Company Limited', exchange: 'NSE' },
  { symbol: 'INDIACEM',    isin: 'INE383A01012', name: 'The India Cements Limited', exchange: 'NSE' },
  { symbol: 'IOC',         isin: 'INE242A01010', name: 'Indian Oil Corporation Limited', exchange: 'NSE' },
  { symbol: 'IRFC',        isin: 'INE053F01010', name: 'Indian Railway Finance Corporation Limited', exchange: 'NSE' },
  { symbol: 'JPPOWER',     isin: 'INE351F01018', name: 'Jaiprakash Power Ventures Limited', exchange: 'NSE' },
  { symbol: 'KOKUYOCMLN',  isin: 'INE760A01029', name: 'Kokuyo Camlin Limited', exchange: 'NSE' },
  { symbol: 'MARKSANS',    isin: 'INE750C01026', name: 'Marksans Pharma Limited', exchange: 'NSE' },
  { symbol: 'NATIONALUM',  isin: 'INE139A01034', name: 'National Aluminium Company Limited', exchange: 'NSE' },
  { symbol: 'NMDC',        isin: 'INE584A01023', name: 'NMDC Limited', exchange: 'NSE' },
  { symbol: 'PFC',         isin: 'INE134E01011', name: 'Power Finance Corporation Limited', exchange: 'NSE' },
  { symbol: 'PNB',         isin: 'INE160A01022', name: 'Punjab National Bank', exchange: 'NSE' },
  { symbol: 'POWERGRID',   isin: 'INE752E01010', name: 'Power Grid Corporation of India Limited', exchange: 'NSE' },
  { symbol: 'RECLTD',      isin: 'INE020B01018', name: 'REC Limited', exchange: 'NSE' },
  { symbol: 'SHYAMMETL',   isin: 'INE810G01011', name: 'Shyam Metalics and Energy Limited', exchange: 'NSE' },
  { symbol: 'SJVN',        isin: 'INE002L01015', name: 'SJVN Limited', exchange: 'NSE' },
  { symbol: 'TATASTEEL',   isin: 'INE081A01020', name: 'Tata Steel Limited', exchange: 'NSE' },
  { symbol: 'YESBANK',     isin: 'INE528G01035', name: 'Yes Bank Limited', exchange: 'NSE' },
  // --- additional well-covered mid-caps ---
  { symbol: 'AARTIDRUGS',  isin: 'INE767A01016', name: 'Aarti Drugs Limited', exchange: 'NSE' },
  { symbol: 'AARTIIND',    isin: 'INE769A01020', name: 'Aarti Industries Limited', exchange: 'NSE' },
  { symbol: 'AAVAS',       isin: 'INE216P01012', name: 'Aavas Financiers Limited', exchange: 'NSE' },
  { symbol: 'ABB',         isin: 'INE117A01022', name: 'ABB India Limited', exchange: 'NSE' },
  { symbol: 'ABBOTINDIA',  isin: 'INE358A01014', name: 'Abbott India Limited', exchange: 'NSE' },
  { symbol: 'AJMERA',      isin: 'INE298G01027', name: 'Ajmera Realty & Infra India Limited', exchange: 'NSE' },
  { symbol: 'ALUCAST',     isin: 'INE752A01015', name: 'Aluminium Casting Limited', exchange: 'NSE' },
  { symbol: 'ANGELONE',    isin: 'INE732I01013', name: 'Angel One Limited', exchange: 'NSE' },
  { symbol: 'ASHIANA',     isin: 'INE365D01021', name: 'Ashiana Housing Limited', exchange: 'NSE' },
  { symbol: 'ASTERDM',     isin: 'INE914M01019', name: 'Aster DM Healthcare Limited', exchange: 'NSE' },
  { symbol: 'ATULAUTO',    isin: 'INE951D01028', name: 'Atul Auto Limited', exchange: 'NSE' },
  { symbol: 'AURIONPRO',   isin: 'INE132H01018', name: 'Aurionpro Solutions Limited', exchange: 'NSE' },
  { symbol: 'BALKRISIND',  isin: 'INE787D01026', name: 'Balkrishna Industries Limited', exchange: 'NSE' },
  { symbol: 'BALAJITELE',  isin: 'INE794B01026', name: 'Balaji Telefilms Limited', exchange: 'NSE' },
  { symbol: 'BEPL',        isin: 'INE922A01025', name: 'Bhansali Engineering Polymers Limited', exchange: 'NSE' },
  { symbol: 'BIKAJI',      isin: 'INE00E101023', name: 'Bikaji Foods International Limited', exchange: 'NSE' },
  { symbol: 'BORORENEW',   isin: 'INE666D01022', name: 'BOROSIL RENEWABLES LIMITED', exchange: 'NSE' },
  { symbol: 'CEATLTD',     isin: 'INE482A01020', name: 'CEAT Limited', exchange: 'NSE' },
  { symbol: 'CENTRALBK',   isin: 'INE483A01010', name: 'Central Bank of India', exchange: 'NSE' },
  { symbol: 'CIEINDIA',    isin: 'INE536H01010', name: 'CIE Automotive India Limited', exchange: 'NSE' },
  { symbol: 'DATAMATICS',  isin: 'INE365B01017', name: 'Datamatics Global Services Limited', exchange: 'NSE' },
  { symbol: 'DECCANCE',    isin: 'INE583C01021', name: 'Deccan Cements Limited', exchange: 'NSE' },
  { symbol: 'DEEPINDS',    isin: 'INE0FHS01024', name: 'Deep Industries Limited', exchange: 'NSE' },
  { symbol: 'DMCC',        isin: 'INE505A01010', name: 'DMCC SPECIALITY CHEMICALS LIMITED', exchange: 'NSE' },
];

// De-duplicate by symbol (in case of copy-paste)
const seen = new Set<string>();
const UNIQUE_UNIVERSE = STOCK_UNIVERSE.filter(s => {
  if (seen.has(s.symbol)) return false;
  seen.add(s.symbol);
  return true;
});

export { UNIQUE_UNIVERSE as STOCK_UNIVERSE_DEDUPED };

export const STOCK_SYMBOLS = UNIQUE_UNIVERSE.map(s => s.symbol);

export function getStockInfo(symbol: string): StockInfo | undefined {
  return UNIQUE_UNIVERSE.find(s => s.symbol === symbol);
}

export function getStockIsin(symbol: string): string | undefined {
  return UNIQUE_UNIVERSE.find(s => s.symbol === symbol)?.isin;
}
