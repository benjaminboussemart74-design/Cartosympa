import { BLOC_FIELD_CANDIDATES, NUANCE_TO_BLOC, SCORE_FIELDS } from './constants.js';

const DEFAULT_QUALIFICATION_THRESHOLD = 12.5;

const parseScore = (value) => {
  if (value == null) return Number.NaN;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const normalised = value.replace(/\s/g, '').replace(',', '.');
    const parsed = Number.parseFloat(normalised);
    return Number.isNaN(parsed) ? Number.NaN : parsed;
  }
  return Number.NaN;
};

export const normaliseBlocName = (bloc) => {
  if (!bloc) {
    return undefined;
  }
  const raw = String(bloc).trim();
  if (!raw) {
    return undefined;
  }
  const upper = raw.toUpperCase();
  if (upper in NUANCE_TO_BLOC) {
    return NUANCE_TO_BLOC[upper];
  }
  const alias = {
    "ENSEMBLE !": 'Ensemble',
    'ENSEMBLE (MAJORITE PRESIDENTIELLE)': 'Ensemble',
    'MAJORITE PRESIDENTIELLE': 'Ensemble',
    'RECONQUETE !': 'Rassemblement National',
    'RN - RASSEMBLEMENT NATIONAL': 'Rassemblement National',
    'RASS. NATIONAL': 'Rassemblement National',
    'RASSSEMBLEMENT NATIONAL': 'Rassemblement National',
    'NOUVEAU FRONT POPULAIRE': 'Nouveau Front Populaire',
    'UNION DE LA GAUCHE': 'Nouveau Front Populaire',
    'GAUCHE': 'Nouveau Front Populaire',
    'UNION DE LA DROITE ET DU CENTRE': 'Divers droite',
    'DROITE': 'Divers droite',
    'CENTRE': 'Centre',
    'DIVERS': 'Divers',
  };
  if (alias[upper]) {
    return alias[upper];
  }
  return raw;
};

const resolveBloc = (candidate) => {
  for (const field of BLOC_FIELD_CANDIDATES) {
    if (candidate[field] != null && candidate[field] !== '') {
      return normaliseBlocName(candidate[field]);
    }
  }
  return undefined;
};

const resolveScore = (candidate) => {
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const scoreField of SCORE_FIELDS) {
    const value = parseScore(candidate[scoreField]);
    if (!Number.isNaN(value) && value > bestScore) {
      bestScore = value;
    }
  }
  return bestScore === Number.NEGATIVE_INFINITY ? 0 : bestScore;
};

const qualifyCandidates = (candidates, { threshold = DEFAULT_QUALIFICATION_THRESHOLD } = {}) => {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const qualifying = sorted.filter((candidate) => candidate.score >= threshold);

  if (qualifying.length >= 2) {
    return qualifying.slice(0, 3);
  }

  return sorted.slice(0, Math.min(2, sorted.length));
};

const applyTransfers = (qualifiers, eliminated, transferMatrix) => {
  const scores = new Map(qualifiers.map((c) => [c, c.score]));

  for (const eliminatedCandidate of eliminated) {
    const blocTransfers = transferMatrix?.[eliminatedCandidate.bloc] || {};
    const distributed = Object.entries(blocTransfers);
    if (!distributed.length) {
      continue;
    }

    const transferable = eliminatedCandidate.score;
    let allocated = 0;

    for (const [targetBloc, share] of distributed) {
      if (!share || share <= 0) continue;
      const addition = transferable * share;
      allocated += addition;
      const targetCandidate = qualifiers.find((candidate) => candidate.bloc === targetBloc);
      if (targetCandidate) {
        scores.set(targetCandidate, scores.get(targetCandidate) + addition);
      }
    }

    const residual = transferable - allocated;
    if (residual > 0 && qualifiers.length) {
      const topCandidate = qualifiers[0];
      scores.set(topCandidate, scores.get(topCandidate) + residual);
    }
  }

  return qualifiers
    .map((candidate) => ({
      ...candidate,
      secondRoundScore: scores.get(candidate),
    }))
    .sort((a, b) => b.secondRoundScore - a.secondRoundScore);
};

export const simulateElection = (candidatesByCirco, scenario) => {
  if (!scenario || !scenario.rules) {
    return { winnersByCirco: new Map(), blocTotals: {}, simulatedByCirco: new Map() };
  }

  const winnersByCirco = new Map();
  const blocTotals = {};
  const simulatedByCirco = new Map();

  const {
    rules: { blocSwings = {}, qualificationThreshold = DEFAULT_QUALIFICATION_THRESHOLD, transferMatrix = {} },
  } = scenario;

  for (const [code, candidates] of candidatesByCirco.entries()) {
    if (!candidates.length) continue;

    const enriched = candidates
      .map((candidate) => {
        const bloc = resolveBloc(candidate) || 'Autres';
        const baseScore = resolveScore(candidate);
        const adjustedScore = Math.max(0, baseScore + (blocSwings[bloc] || 0));
        return { candidate, bloc, score: adjustedScore, baseScore };
      })
      .filter((candidate) => candidate.score > 0);

    if (!enriched.length) {
      continue;
    }

    const qualifiers = qualifyCandidates(enriched, { threshold: qualificationThreshold });
    const eliminated = enriched.filter((candidate) => !qualifiers.includes(candidate));
    const secondRound = applyTransfers(qualifiers, eliminated, transferMatrix);
    const winner = secondRound[0];

    blocTotals[winner.bloc] = (blocTotals[winner.bloc] || 0) + 1;
    winnersByCirco.set(code, {
      winner: winner.candidate,
      blocName: winner.bloc,
      scores: secondRound,
    });
    simulatedByCirco.set(code, {
      qualifiers: secondRound,
      eliminated,
    });
  }

  return { winnersByCirco, blocTotals, simulatedByCirco };
};

export const SCENARIOS = [
  {
    id: 'none',
    label: 'Aucun scénario',
    description: 'Affiche les données brutes sans projection de second tour.',
    rules: null,
  },
  {
    id: 'barrage-rn',
    label: 'Barrage républicain',
    description:
      'Hypothèse où les forces hors RN se retirent en faveur du mieux placé et récupèrent une partie de leurs voix.',
    rules: {
      blocSwings: {
        Ensemble: 1.5,
        'Nouveau Front Populaire': 1.5,
        'Rassemblement National': -2,
      },
      qualificationThreshold: 12.5,
      transferMatrix: {
        Ensemble: {
          'Nouveau Front Populaire': 0.45,
          'Les Républicains': 0.1,
        },
        'Les Républicains': {
          Ensemble: 0.25,
          'Rassemblement National': 0.35,
        },
        'Divers droite': {
          Ensemble: 0.2,
          'Rassemblement National': 0.3,
        },
        'Divers gauche': {
          'Nouveau Front Populaire': 0.5,
        },
        Centre: {
          Ensemble: 0.4,
        },
      },
    },
  },
  {
    id: 'union-gauche',
    label: 'Union renforcée de la gauche',
    description:
      "Simulation d'un front de gauche élargi avec reports massifs des candidatures périphériques et légère érosion de la majorité sortante.",
    rules: {
      blocSwings: {
        'Nouveau Front Populaire': 4,
        Ensemble: -1,
      },
      qualificationThreshold: 10,
      transferMatrix: {
        Ensemble: {
          'Nouveau Front Populaire': 0.35,
        },
        'Divers gauche': {
          'Nouveau Front Populaire': 0.6,
        },
        Divers: {
          'Nouveau Front Populaire': 0.15,
          Ensemble: 0.15,
        },
      },
    },
  },
];

export const getScenarioById = (id) => SCENARIOS.find((scenario) => scenario.id === id);
