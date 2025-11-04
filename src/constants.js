export const BLOC_COLORS = {
  RN_UDR: '#002060',
  NFP: '#E41A1C',
  Renaissance: '#FFD700',
  LR: '#0072B2',
  Reconquête: '#7030A0',
  Divers: '#B0B0B0',
};

export const BLOC_LABELS = {
  RN_UDR: 'Rassemblement national / UDR',
  NFP: 'Nouveau Front Populaire',
  Renaissance: 'Renaissance',
  LR: 'Les Républicains',
  Reconquête: 'Reconquête',
  Divers: 'Divers et autres blocs',
};

export const DEFAULT_BLOC = 'Divers';

const BLOC_ALIASES = {
  'RASSEMBLEMENT NATIONAL': 'RN_UDR',
  'RN - RASSEMBLEMENT NATIONAL': 'RN_UDR',
  'RN_UDR': 'RN_UDR',
  'RN': 'RN_UDR',
  'RASS. NATIONAL': 'RN_UDR',
  'RASSSEMBLEMENT NATIONAL': 'RN_UDR',
  'RACASSEMENT NATIONAL': 'RN_UDR',
  'RECONQUETE !': 'Reconquête',
  'RECONQUÊTE !': 'Reconquête',
  'RECONQUETE': 'Reconquête',
  'RECONQUÊTE': 'Reconquête',
  'RECONQUETE_PRESIDENTIELLE': 'Reconquête',
  'ENSEMBLE !': 'Renaissance',
  'ENSEMBLE (MAJORITE PRESIDENTIELLE)': 'Renaissance',
  'MAJORITE PRESIDENTIELLE': 'Renaissance',
  'MAJORITÉ PRESIDENTIELLE': 'Renaissance',
  'RENAISSANCE': 'Renaissance',
  'NOUVEAU FRONT POPULAIRE': 'NFP',
  'NOUVELLE UNION POPULAIRE': 'NFP',
  'UNION DE LA GAUCHE': 'NFP',
  'GAUCHE': 'NFP',
  'UNION DE LA DROITE ET DU CENTRE': 'LR',
  'LES REPUBLICAINS': 'LR',
  'LES RÉPUBLICAINS': 'LR',
  'LR': 'LR',
  'DROITE': 'LR',
  'CENTRE': 'Renaissance',
  'DIVERS': 'Divers',
  'AUTRES': 'Divers',
  'AUTRE': 'Divers',
  'DIVERS DROITE': 'Divers',
  'DIVERS GAUCHE': 'Divers',
  'REGIONALISTE': 'Divers',
};

export const NUANCE_TO_BLOC = {
  NFP: 'NFP',
  UG: 'NFP',
  G: 'NFP',
  SOC: 'NFP',
  EELV: 'NFP',
  LFI: 'NFP',
  FI: 'NFP',
  PCF: 'NFP',
  DVG: 'NFP',
  DVC: 'Divers',
  DVD: 'Divers',
  UDI: 'Renaissance',
  MODEM: 'Renaissance',
  ENS: 'Renaissance',
  REN: 'Renaissance',
  HOR: 'Renaissance',
  RE: 'Renaissance',
  LR: 'LR',
  UDC: 'LR',
  RN: 'RN_UDR',
  'RASSEMBLEMENT NATIONAL': 'RN_UDR',
  "UNION DE L'EXTREME DROITE": 'RN_UDR',
  DLF: 'RN_UDR',
  EXD: 'RN_UDR',
  REC: 'Reconquête',
  'RECONQUETE !': 'Reconquête',
  'RECONQUÊTE !': 'Reconquête',
  DIV: 'Divers',
  REG: 'Divers',
  AUT: 'Divers',
};

export const BLOC_FIELD_CANDIDATES = [
  'Bloc',
  'BlocPolitique',
  'Bloc_politique',
  'BlocPolitiqueMajoritaire',
  'BlocMajoritaire',
  'BlocMajoritaire2',
  'Bloc2',
  'Bloc second tour',
  'BlocSecondTour',
  'Bloc_politique_second_tour',
];

export const CODE_CIRCO_FIELDS = [
  'CodeCirconscription',
  'code_circo',
  'Code_circonscription',
  'code_circonscription',
  'Code Circonscription',
];

export const WINNER_FLAG_FIELDS = [
  'Elu',
  'elu',
  'EstElu',
  'est_elu',
  'Elu_T2',
  'EluSecondTour',
];

export const SCORE_FIELDS = [
  'Voix',
  'VoixSecondTour',
  'Voix_2',
  'NbVoix',
  'NombreVoix',
  'NombreVoixSecondTour',
  'Score',
  'ScoreSecondTour',
  'Pourcentage',
  'PourcentageVoix',
  'PourcentageVoixExprimés',
  'PourcentageVoixExprimes',
  'PourcentageVoixInscrits',
  'PourcentageExp',
  'Score%'
];

export const IDENTITY_FIELDS = [
  'Prenom',
  'Prénom',
  'PrenomCandidat',
  'Prenom_Candidat',
  'PrénomCandidat',
  'Nom',
  'NomCandidat',
  'Nom_Candidat',
  'Nom de famille',
];

export const PARTY_FIELDS = [
  'Nuance',
  'NuanceListe',
  'NuanceListe2',
  'Nuance_Candidat',
  'Parti',
  'LibelleParti',
  'LibelleNuance',
];

export const normaliseBloc = (value) => {
  if (!value && value !== 0) {
    return undefined;
  }
  const raw = String(value).trim();
  if (!raw) {
    return undefined;
  }
  const upper = raw.toUpperCase();
  if (NUANCE_TO_BLOC[upper]) {
    return NUANCE_TO_BLOC[upper];
  }
  if (BLOC_ALIASES[upper]) {
    return BLOC_ALIASES[upper];
  }
  return raw;
};

export const getBlocLabel = (bloc) => BLOC_LABELS[bloc] ?? bloc;
