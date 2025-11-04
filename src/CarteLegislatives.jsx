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

const GEOJSON_URL_DEV =
  '/geo/resources/contours-geographiques-des-circonscriptions-legislatives/20240613-191520/circonscriptions-legislatives-p10.geojson';
const GEOJSON_URL_PROD =
  'https://static.data.gouv.fr/resources/contours-geographiques-des-circonscriptions-legislatives/20240613-191520/circonscriptions-legislatives-p10.geojson';

const RESULTS_BASE_DEV = '/tabular/api/resources/6682d0c255dcda5df20b1d90/data';
const RESULTS_BASE_PROD =
  'https://tabular-api.data.gouv.fr/api/resources/6682d0c255dcda5df20b1d90/data';

const IS_LOCAL =
  typeof window !== 'undefined' && /localhost|127\.0\.0\.1/.test(window.location.hostname);
const GEOJSON_URL = IS_LOCAL ? GEOJSON_URL_DEV : GEOJSON_URL_PROD;
const RESULTS_BASE = IS_LOCAL ? RESULTS_BASE_DEV : RESULTS_BASE_PROD;

const RESULTS_PAGE_SIZE = 200;
const MAX_RESULTS_PAGES = 200;

const DEFAULT_FILL = '#cccccc';

const BLOC_NAME_ALIASES = {
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
  if (BLOC_NAME_ALIASES[upper]) {
    return BLOC_NAME_ALIASES[upper];
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
  feature?.properties?.code_circo || feature?.properties?.CodeCirconscription;

const getResultCode = (entry) => {
  for (const field of CODE_CIRCO_FIELDS) {
    const value = entry[field];
    if (value != null && value !== '') {
      return String(value).trim();
    }
  }
  return undefined;
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

    const fetchAllResults = async () => {
      const all = [];
      let page = 1;

      while (page <= MAX_RESULTS_PAGES) {
        const url = `${RESULTS_BASE}?page=${page}&page_size=${RESULTS_PAGE_SIZE}`;
        const res = await fetch(url);
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(
            `Erreur lors du chargement des résultats (${res.status})${text ? ` : ${text}` : ''}`
          );
        }
        const json = await res.json();
        const rows = Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json)
          ? json
          : [];
        if (!rows.length) {
          break;
        }
        all.push(...rows);
        if (rows.length < RESULTS_PAGE_SIZE) {
          break;
        }
        page += 1;
      }

      return all;
    };

    const fetchData = async () => {
      try {
        const [geoResponse, rows] = await Promise.all([fetch(GEOJSON_URL), fetchAllResults()]);

        if (!geoResponse.ok) {
          const text = await geoResponse.text().catch(() => '');
          throw new Error(
            `Erreur lors du chargement des contours (${geoResponse.status})${text ? ` : ${text}` : ''}`
          );
        }

        const geoData = await geoResponse.json();

        if (isMounted) {
          setGeoJson(geoData);
          setResults(rows);
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
