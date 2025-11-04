import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet';
import {
  BLOC_COLORS,
  BLOC_FIELD_CANDIDATES,
  CODE_CIRCO_FIELDS,
  DEFAULT_BLOC,
  IDENTITY_FIELDS,
  PARTY_FIELDS,
  SCORE_FIELDS,
  WINNER_FLAG_FIELDS,
  getBlocLabel,
  normaliseBloc,
} from './constants.js';

const GEOJSON_URL =
  'https://static.data.gouv.fr/resources/contours-geographiques-des-circonscriptions-legislatives/20240613-191520/circonscriptions-legislatives-p10.geojson';
const RESULTS_URL =
  'https://tabular-api.data.gouv.fr/api/resources/6682d0c255dcda5df20b1d90/data/?page_size=1000';

const DEFAULT_FILL = BLOC_COLORS.Divers || '#B0B0B0';

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
  const blocLabel = blocName ? getBlocLabel(blocName) : undefined;
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
    blocLabel ? `<span>${blocLabel}</span>` : undefined,
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

    const fetchData = async () => {
      try {
        const [geoResponse, resultsResponse] = await Promise.all([
          fetch(GEOJSON_URL),
          fetch(RESULTS_URL),
        ]);

        if (!geoResponse.ok) {
          throw new Error(`Erreur lors du chargement des contours (${geoResponse.status})`);
        }
        if (!resultsResponse.ok) {
          throw new Error(
            `Erreur lors du chargement des résultats (${resultsResponse.status})`
          );
        }

        const geoData = await geoResponse.json();
        const resultsData = await resultsResponse.json();
        const rows = Array.isArray(resultsData?.data)
          ? resultsData.data
          : Array.isArray(resultsData)
          ? resultsData
          : [];

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
      const bloc =
        normaliseBloc(blocValue) || normaliseBloc(nuance) || DEFAULT_BLOC;
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
      label: getBlocLabel(bloc),
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
              <span className="summary-label">{item.label}</span>
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
