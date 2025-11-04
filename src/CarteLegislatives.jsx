import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet';
import {
  BLOC_COLORS,
  BLOC_FIELD_CANDIDATES,
  CODE_CIRCO_FIELDS,
  IDENTITY_FIELDS,
  NUANCE_TO_BLOC,
  PARTY_FIELDS,
  SCORE_FIELDS,
  WINNER_FLAG_FIELDS,
} from './constants.js';

const GEOJSON_P10_URL = '/data/circonscriptions-legislatives-p10.geojson';
const GEOJSON_P20_URL = '/data/circonscriptions-legislatives-p20.geojson';
const RESULTS_URL = '/data/results.json';

const DEFAULT_FILL = '#cccccc';

const DEPARTMENT_CODE_FIELDS = [
  'CodeDepartement',
  'codeDepartement',
  'Code du département',
  'Code Département',
];

const CIRCO_NUMBER_FIELDS = [
  'Code de la circonscription',
  'Code circonscription',
  'codeCirconscriptionNumero',
  'numero_circonscription',
];

const SHARED_METADATA_FIELDS = [
  'Code du département',
  'Code de la circonscription',
  'Libellé du département',
  'Libellé de la circonscription',
  'Etat saisie',
  'Inscrits',
  'Abstentions',
  'Votants',
  'Blancs',
  'Nuls',
  'Exprimés',
  '% Abs/Ins',
  '% Vot/Ins',
  '% Exp/Ins',
  '% Exp/Vot',
  '% Blancs/Ins',
  '% Blancs/Vot',
  '% Nuls/Ins',
  '% Nuls/Vot',
];

const CANDIDATE_FIELD_MAPPINGS = [
  {
    fields: {
      'N°Panneau': 'N°Panneau',
      Sexe: 'Sexe',
      Nom: 'Nom',
      'Prénom': 'Prénom',
      Nuance: 'Nuance',
      Voix: 'Voix',
      '% Voix/Ins': '% Voix/Ins',
      '% Voix/Exp': '% Voix/Exp',
      Elu: 'Elu',
    },
  },
  {
    fields: {
      'N°Panneau': '__EMPTY',
      Sexe: '__EMPTY_1',
      Nom: '__EMPTY_2',
      'Prénom': '__EMPTY_3',
      Nuance: '__EMPTY_4',
      Voix: '__EMPTY_5',
      '% Voix/Ins': '__EMPTY_6',
      '% Voix/Exp': '__EMPTY_7',
      Elu: '__EMPTY_8',
    },
  },
];

const parseNumber = (value) => {
  if (value == null) {
    return Number.NaN;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const normalised = value.replace(/\s/g, '').replace(',', '.');
    const parsed = Number.parseFloat(normalised);
    return Number.isNaN(parsed) ? Number.NaN : parsed;
  }
  return Number.NaN;
};

const normaliseBlocName = (bloc) => {
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

const extractValue = (entry, candidates) => {
  for (const field of candidates) {
    if (entry[field] != null && entry[field] !== '') {
      return entry[field];
    }
  }
  return undefined;
};

const detectWinner = (candidates) => {
  const winnerByFlag = candidates.find((candidate) =>
    WINNER_FLAG_FIELDS.some((field) => {
      const flag = candidate[field];
      if (flag == null) {
        return false;
      }
      if (typeof flag === 'number') {
        return flag === 1;
      }
      if (typeof flag === 'boolean') {
        return flag;
      }
      if (typeof flag === 'string') {
        const normalised = flag.trim().toLowerCase();
        return ['oui', 'yes', 'true', '1', 'elu'].includes(normalised);
      }
      return false;
    })
  );
  if (winnerByFlag) {
    return winnerByFlag;
  }

  let bestCandidate = candidates[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    let candidateScore = Number.NEGATIVE_INFINITY;
    for (const scoreField of SCORE_FIELDS) {
      const value = parseNumber(candidate[scoreField]);
      if (!Number.isNaN(value) && value > candidateScore) {
        candidateScore = value;
      }
    }
    if (candidateScore > bestScore) {
      bestScore = candidateScore;
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
};

const getFeatureCode = (feature) =>
  feature?.properties?.code_circo ||
  feature?.properties?.CodeCirconscription ||
  feature?.properties?.codeCirconscription ||
  feature?.properties?.Code_circonscription ||
  feature?.properties?.code_circonscription;

const getResultCode = (entry) => {
  for (const field of CODE_CIRCO_FIELDS) {
    const value = entry[field];
    if (value != null && value !== '') {
      const trimmed = String(value).trim();
      if (trimmed && trimmed.length >= 4) {
        return trimmed;
      }
    }
  }

  const departmentRaw = extractValue(entry, DEPARTMENT_CODE_FIELDS);
  const circoRaw = extractValue(entry, CIRCO_NUMBER_FIELDS);

  if (!departmentRaw || !circoRaw) {
    return undefined;
  }

  const departmentString = String(departmentRaw).trim();
  const circoString = String(circoRaw).trim();

  if (!departmentString || !circoString) {
    return undefined;
  }

  const normaliseNumeric = (value, minLength = 1) => {
    const stringValue = String(value).trim();
    if (!/^\d+$/.test(stringValue)) {
      return stringValue;
    }
    const length = Math.max(minLength, stringValue.length);
    return stringValue.padStart(length, '0');
  };

  const departmentCode = normaliseNumeric(departmentString, departmentString.length >= 3 ? departmentString.length : 2);
  const circoCode = normaliseNumeric(circoString, 2);

  return `${departmentCode}${circoCode}`;
};

const mergeFeatureCollections = (collections) => {
  const features = [];

  for (const collection of collections) {
    if (collection?.type === 'FeatureCollection' && Array.isArray(collection.features)) {
      features.push(...collection.features);
    }
  }

  return { type: 'FeatureCollection', features };
};

const createCandidateFromEntry = (entry, fieldMapping, code) => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const candidate = {};
  let hasCoreData = false;

  for (const [targetField, sourceField] of Object.entries(fieldMapping.fields)) {
    if (!sourceField) {
      continue;
    }
    const value = entry[sourceField];
    if (value != null && value !== '') {
      candidate[targetField] = value;
      if (['Nom', 'Prénom', 'Nuance', 'Voix'].includes(targetField) && String(value).trim() !== '') {
        hasCoreData = true;
      }
    }
  }

  if (!hasCoreData) {
    return null;
  }

  for (const field of SHARED_METADATA_FIELDS) {
    const value = entry[field];
    if (value != null && value !== '') {
      candidate[field] = value;
    }
  }

  if (code) {
    candidate.CodeCirconscription = code;
    candidate.code_circo = code;
  }

  const departmentRaw = extractValue(entry, DEPARTMENT_CODE_FIELDS);
  if (departmentRaw) {
    const departmentString = String(departmentRaw).trim();
    if (departmentString) {
      candidate.CodeDepartement = departmentString;
      candidate.codeDepartement = departmentString;
    }
  }

  const circoNumber = extractValue(entry, CIRCO_NUMBER_FIELDS);
  if (circoNumber) {
    const circoString = String(circoNumber).trim();
    if (circoString) {
      candidate['Code de la circonscription'] = circoString;
    }
  }

  if (!candidate.Bloc && candidate.Nuance) {
    candidate.Bloc = candidate.Nuance;
  }

  return candidate;
};

const transformResultsRows = (rows) => {
  if (!Array.isArray(rows)) {
    return [];
  }

  const processed = [];

  for (const entry of rows) {
    const code = getResultCode(entry);

    for (const mapping of CANDIDATE_FIELD_MAPPINGS) {
      const candidate = createCandidateFromEntry(entry, mapping, code);
      if (candidate) {
        processed.push(candidate);
      }
    }
  }

  return processed;
};

const buildPopupContent = (winner, blocName) => {
  if (!winner) {
    return '<p>Résultats indisponibles</p>';
  }
  const identity = extractValue(winner, IDENTITY_FIELDS) || '';
  const party = extractValue(winner, PARTY_FIELDS);
  const voteLines = SCORE_FIELDS.map((field) => {
    const value = winner[field];
    if (value == null || value === '') {
      return undefined;
    }
    if (typeof value === 'number') {
      return `<strong>${field}</strong> : ${value}`;
    }
    const trimmed = String(value).trim();
    return trimmed ? `<strong>${field}</strong> : ${trimmed}` : undefined;
  }).filter(Boolean);

  const lines = [
    identity ? `<strong>${identity}</strong>` : undefined,
    blocName ? `<span>${blocName}</span>` : undefined,
    party ? `<span>${party}</span>` : undefined,
    ...voteLines.slice(0, 4),
  ].filter(Boolean);

  if (!lines.length) {
    lines.push('Résultats indisponibles');
  }

  return `<div class="popup-content">${lines.join('<br/>')}</div>`;
};

const CarteLegislatives = ({ blocColors = BLOC_COLORS, swingDelta = null }) => {
  const [geoJson, setGeoJson] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    const fetchData = async () => {
      try {
        const [p10Response, p20Response, resultsResponse] = await Promise.all([
          fetch(GEOJSON_P10_URL),
          fetch(GEOJSON_P20_URL),
          fetch(RESULTS_URL),
        ]);

        if (!p10Response.ok) {
          const text = await p10Response.text().catch(() => '');
          throw new Error(
            `Erreur lors du chargement des contours P10 (${p10Response.status})${text ? ` : ${text}` : ''}`
          );
        }

        if (!p20Response.ok) {
          const text = await p20Response.text().catch(() => '');
          throw new Error(
            `Erreur lors du chargement des contours P20 (${p20Response.status})${text ? ` : ${text}` : ''}`
          );
        }

        if (!resultsResponse.ok) {
          const text = await resultsResponse.text().catch(() => '');
          throw new Error(
            `Erreur lors du chargement des résultats (${resultsResponse.status})${text ? ` : ${text}` : ''}`
          );
        }

        const [geoP10, geoP20, rawResults] = await Promise.all([
          p10Response.json(),
          p20Response.json(),
          resultsResponse.json(),
        ]);

        const mergedGeoJson = mergeFeatureCollections([geoP10, geoP20]);
        const rows = Array.isArray(rawResults?.data)
          ? rawResults.data
          : Array.isArray(rawResults)
          ? rawResults
          : [];
        const processedResults = transformResultsRows(rows);

        if (isMounted) {
          setGeoJson(mergedGeoJson);
          setResults(processedResults);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err);
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, []);

  const { winnersByCirco, blocTotals } = useMemo(() => {
    const candidatesByCirco = new Map();
    const totals = {};

    for (const entry of results) {
      const code = getResultCode(entry);
      if (!code) {
        continue;
      }
      if (!candidatesByCirco.has(code)) {
        candidatesByCirco.set(code, []);
      }
      candidatesByCirco.get(code).push(entry);
    }

    const winners = new Map();

    for (const [code, candidates] of candidatesByCirco.entries()) {
      if (!candidates.length) {
        continue;
      }
      const winner = detectWinner(candidates);
      const blocRaw = extractValue(winner, BLOC_FIELD_CANDIDATES);
      const blocName = normaliseBlocName(blocRaw) || 'Autres';

      totals[blocName] = (totals[blocName] || 0) + 1;
      winners.set(code, {
        winner,
        blocName,
      });
    }

    return { winnersByCirco: winners, blocTotals: totals };
  }, [results]);

  const geoJsonHandlers = useMemo(() => {
    const baseOpacity = swingDelta != null ? Math.min(0.9, 0.6 + Math.abs(swingDelta) * 0.1) : 0.7;

    const style = (feature) => {
      const code = getFeatureCode(feature);
      const data = code ? winnersByCirco.get(code) : undefined;
      const blocName = data?.blocName;
      const fillColor = blocName && blocColors[blocName] ? blocColors[blocName] : DEFAULT_FILL;

      return {
        color: '#1f2933',
        weight: 1,
        fillColor,
        fillOpacity: baseOpacity,
      };
    };

    const onEachFeature = (feature, layer) => {
      const code = getFeatureCode(feature);
      const data = code ? winnersByCirco.get(code) : undefined;
      const popupHtml = buildPopupContent(data?.winner, data?.blocName);
      layer.bindPopup(popupHtml);
      layer.on('mouseover', () => layer.openPopup());
      layer.on('mouseout', () => layer.closePopup());
    };

    return { style, onEachFeature };
  }, [blocColors, swingDelta, winnersByCirco]);

  const blocEntries = useMemo(() => {
    return Object.entries(blocTotals)
      .map(([bloc, count]) => ({ bloc, count, color: blocColors[bloc] || DEFAULT_FILL }))
      .sort((a, b) => b.count - a.count);
  }, [blocTotals, blocColors]);

  if (loading) {
    return <div className="status">Chargement des données…</div>;
  }

  if (error) {
    return <div className="status error">Erreur : {error.message}</div>;
  }

  if (!geoJson) {
    return <div className="status">Aucun contour disponible.</div>;
  }

  return (
    <section className="map-container">
      <MapContainer
        center={[46.603354, 1.888334]}
        zoom={6}
        scrollWheelZoom
        className="leaflet-map"
      >
        <TileLayer
          attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <GeoJSON key="circonscriptions" data={geoJson} {...geoJsonHandlers} />
      </MapContainer>

      <aside className="map-summary">
        <h2>Répartition des blocs vainqueurs</h2>
        <ul>
          {blocEntries.map(({ bloc, count, color }) => (
            <li key={bloc}>
              <span className="summary-color" style={{ backgroundColor: color }} />
              <span className="summary-label">{bloc}</span>
              <span className="summary-value">{count}</span>
            </li>
          ))}
        </ul>
        {swingDelta == null && (
          <p className="swing-placeholder">
            Les variations de swing seront bientôt disponibles.
          </p>
        )}
      </aside>
    </section>
  );
};

CarteLegislatives.propTypes = {
  blocColors: PropTypes.objectOf(PropTypes.string),
  swingDelta: PropTypes.number,
};

export default CarteLegislatives;
