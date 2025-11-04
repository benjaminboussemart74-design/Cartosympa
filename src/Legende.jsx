import PropTypes from 'prop-types';
import { getBlocLabel } from './constants.js';

const Legende = ({ blocColors }) => {
  const entries = Object.entries(blocColors);

  return (
    <section className="legend">
      <h2>Légende</h2>
      <ul>
        {entries.map(([bloc, color]) => (
          <li key={bloc}>
            <span className="legend-color" style={{ backgroundColor: color }} />
            <span className="legend-label">{getBlocLabel(bloc)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

Legende.propTypes = {
  blocColors: PropTypes.objectOf(PropTypes.string).isRequired,
};

export default Legende;
