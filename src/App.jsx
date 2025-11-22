import { useMemo, useState } from 'react';
import CarteLegislatives from './CarteLegislatives.jsx';
import Legende from './Legende.jsx';
import { BLOC_COLORS } from './constants.js';
import { SCENARIOS, getScenarioById } from './simulation.js';
import './App.css';

function App() {
  const [selectedScenarioId, setSelectedScenarioId] = useState('none');

  const selectedScenario = useMemo(() => getScenarioById(selectedScenarioId), [selectedScenarioId]);

  return (
    <div className="app">
      <header>
        <h1>Cartographie des circonscriptions législatives</h1>
        <p>
          Exploration des résultats par circonscription et visualisation des blocs politiques vainqueurs.
        </p>
      </header>

      <div className="scenario-panel">
        <div>
          <label htmlFor="scenario">Choix du scénario :</label>
          <select
            id="scenario"
            value={selectedScenarioId}
            onChange={(event) => setSelectedScenarioId(event.target.value)}
          >
            {SCENARIOS.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.label}
              </option>
            ))}
          </select>
        </div>
        <p className="scenario-description">
          {selectedScenario?.description || 'Sélectionnez un scénario pour lancer une simulation.'}
        </p>
      </div>

      <Legende blocColors={BLOC_COLORS} />
      <CarteLegislatives blocColors={BLOC_COLORS} selectedScenario={selectedScenario} />
    </div>
  );
}

export default App;
