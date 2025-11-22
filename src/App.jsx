import { useMemo, useState } from 'react';
import CarteLegislatives from './CarteLegislatives.jsx';
import Legende from './Legende.jsx';
import { BLOC_COLORS } from './constants.js';
import { SCENARIOS, getScenarioById } from './simulation.js';
import './App.css';

function App() {
  const [swingDelta, setSwingDelta] = useState(5);

  const handleSwingChange = (value) => {
    const parsed = Number.parseFloat(value);
    if (Number.isNaN(parsed)) {
      setSwingDelta(0);
      return;
    }
    setSwingDelta(Math.max(0, Math.min(15, parsed)));
  };

  return (
    <div className="app">
      <header>
        <h1>Cartographie des circonscriptions législatives</h1>
        <p>
          Exploration des résultats par circonscription et visualisation des blocs politiques vainqueurs.
        </p>
      </header>

      <section className="controls">
        <div className="control-header">
          <h2>Variation de swing</h2>
          <span className="control-value">{swingDelta.toFixed(1)} pts</span>
        </div>
        <label htmlFor="swing-delta" className="control-label">
          Seuil d&apos;écart entre les deux premiers candidats (en points)
        </label>
        <div className="control-inputs">
          <input
            id="swing-delta"
            type="range"
            min="0"
            max="15"
            step="0.5"
            value={swingDelta}
            onChange={(event) => handleSwingChange(event.target.value)}
          />
          <input
            type="number"
            min="0"
            max="15"
            step="0.5"
            value={swingDelta}
            onChange={(event) => handleSwingChange(event.target.value)}
          />
        </div>
        <p className="control-help">
          Les circonscriptions où l&apos;écart est inférieur ou égal à ce seuil sont
          mises en évidence (couleurs éclaircies et opacité renforcée).
        </p>
      </section>

      <Legende blocColors={BLOC_COLORS} />
      <CarteLegislatives blocColors={BLOC_COLORS} selectedScenario={selectedScenario} />
    </div>
  );
}

export default App;
