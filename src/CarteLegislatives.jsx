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

const GEOJSON_URL =
  'https://static.data.gouv.fr/resources/contours-geographiques-des-circonscriptions-legislatives/20240613-191520/circonscriptions-legislatives-p10.geojson';
const RESULTS_URL =
  'https://tabular-api.data.gouv.fr/api/resources/6682d0c255dcda5df20b1d90/data/?page_size=1000';
const MAX_RESULTS_PAGES = 100;

const DEFAULT_FILL = '#cccccc';

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
  feature?.properties?.code_circo || feature?.properties?.CodeCirconscription;

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

const CarteLegislatives = ({ blocColors, swingDelta }) => {
  const [geoJson, setGeoJson] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    const fetchAllResults = async () => {
      const aggregatedRows = [];
      const visitedUrls = new Set();
      let nextUrl = RESULTS_URL;
      let pageCount = 0;

      const resolveNextUrl = (currentUrl, candidate) => {
        if (!candidate) {
          return null;
        }
        try {
          return new URL(candidate, currentUrl).toString();
        } catch (error) {
          return null;
        }
      };

      while (nextUrl && pageCount < MAX_RESULTS_PAGES) {
        if (visitedUrls.has(nextUrl)) {
          break;
        }

        visitedUrls.add(nextUrl);
        pageCount += 1;

        const response = await fetch(nextUrl);
        if (!response.ok) {
          throw new Error(
            `Erreur lors du chargement des résultats (${response.status})`
          );
        }

        const data = await response.json();
        const pageRows = Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data)
          ? data
          : [];

        aggregatedRows.push(...pageRows);

        const discoveredNext =
          resolveNextUrl(nextUrl, data?.next) ||
          resolveNextUrl(nextUrl, data?.links?.next) ||
          resolveNextUrl(nextUrl, data?.pagination?.next);

        if (discoveredNext) {
          nextUrl = discoveredNext;
          continue;
        }

        if (!pageRows.length) {
          break;
        }

        try {
          const candidateUrl = new URL(nextUrl);
          const paramCandidates = ['page', 'page_number'];
          let updated = false;

          for (const param of paramCandidates) {
            const rawValue = candidateUrl.searchParams.get(param);
            if (rawValue != null) {
              const numericValue = Number.parseInt(rawValue, 10);
              if (!Number.isNaN(numericValue)) {
                candidateUrl.searchParams.set(param, `${numericValue + 1}`);
                nextUrl = candidateUrl.toString();
                updated = true;
                break;
              }
            }
          }

          if (!updated) {
            if (!candidateUrl.searchParams.has('page')) {
              candidateUrl.searchParams.set('page', '2');
              nextUrl = candidateUrl.toString();
              updated = true;
            }
          }

          if (!updated) {
            break;
          }
        } catch (parseError) {
          break;
        }
      }

      if (nextUrl && pageCount >= MAX_RESULTS_PAGES) {
        throw new Error('Nombre maximum de pages de résultats dépassé');
      }

      return aggregatedRows;
    };

    const fetchData = async () => {
      try {
        const [geoResponse, rows] = await Promise.all([
          fetch(GEOJSON_URL),
          fetchAllResults(),
        ]);

        if (!geoResponse.ok) {
          throw new Error(`Erreur lors du chargement des contours (${geoResponse.status})`);
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
    const grouped = new Map();
    const totals = new Map();

    for (const entry of results) {
      const code = extractValue(entry, CODE_CIRCO_FIELDS);
      if (!code) {
        continue;
      }
      const existing = grouped.get(code) ?? [];
      existing.push(entry);
      grouped.set(code, existing);
    }

    const winners = new Map();

    for (const [code, candidates] of grouped.entries()) {
      if (!candidates.length) {
        continue;
      }
      const winner = detectWinner(candidates);
      const blocValue = extractValue(winner, BLOC_FIELD_CANDIDATES);
      const nuance = extractValue(winner, PARTY_FIELDS);
      const bloc = normaliseBlocName(blocValue) || normaliseBlocName(nuance) || 'Autres';
      winners.set(code, { winner, bloc });

      const total = totals.get(bloc) ?? 0;
      totals.set(bloc, total + 1);
    }

    return {
      winnersByCirco: winners,
      blocTotals: totals,
    };
  }, [results]);

  const summaryItems = useMemo(() => {
    const entries = Array.from(blocTotals.entries()).map(([bloc, total]) => ({
      bloc,
      total,
      color: blocColors[bloc] ?? DEFAULT_FILL,
    }));

    entries.sort((a, b) => b.total - a.total);
    return entries;
  }, [blocTotals, blocColors]);

  const renderLayers = () => {
    if (!geoJson?.features) {
      return null;
    }

    return geoJson.features.map((feature) => {
      const code = getFeatureCode(feature);
      const details = code ? winnersByCirco.get(code) : undefined;
      const blocName = details?.bloc;
      const fillColor = (blocName && blocColors[blocName]) || DEFAULT_FILL;

      return (
        <GeoJSON
          key={code || Math.random()}
          data={feature}
          style={{
            color: '#444',
            weight: 1,
            fillColor,
            fillOpacity: 0.65,
          }}
          onEachFeature={(_, layer) => {
            const popupHtml = buildPopupContent(details?.winner, blocName);
            layer.bindPopup(popupHtml);
          }}
        />
      );
    });
  };

  if (loading) {
    return <p className="status">Chargement des données…</p>;
  }

  if (error) {
    return (
      <div className="status error">
        Impossible de charger les données : {error.message}
      </div>
    );
  }

  return (
    <div className="map-container">
      <MapContainer center={[46.6, 2.5]} zoom={6} className="leaflet-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {renderLayers()}
      </MapContainer>

      <aside className="map-summary">
        <h2>Sièges remportés par bloc</h2>
        <ul>
          {summaryItems.map((item) => (
            <li key={item.bloc}>
              <span
                className="summary-color"
                style={{ backgroundColor: item.color }}
              />
              <span className="summary-label">{item.bloc}</span>
              <span className="summary-value">{item.total}</span>
            </li>
          ))}
          {!summaryItems.length && <li>Aucun résultat disponible</li>}
        </ul>
        {swingDelta != null && (
          <p className="swing-placeholder">Delta à venir : {swingDelta}</p>
        )}
      </aside>
    </div>
  );
};

CarteLegislatives.propTypes = {
  blocColors: PropTypes.objectOf(PropTypes.string).isRequired,
  swingDelta: PropTypes.any,
};

CarteLegislatives.defaultProps = {
  swingDelta: null,
};

export default CarteLegislatives;
export { BLOC_COLORS };
