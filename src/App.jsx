import { useState } from 'react';
import CarteLegislatives from './CarteLegislatives.jsx';
import Legende from './Legende.jsx';
import { BLOC_COLORS } from './constants.js';
import './App.css';

function App() {
  const [swingDelta] = useState(null);

  return (
    <div className="app">
      <header>
        <h1>Cartographie des circonscriptions législatives</h1>
        <p>
          Exploration des résultats par circonscription et visualisation des blocs
          politiques vainqueurs.
        </p>
      </header>

      <Legende blocColors={BLOC_COLORS} />
      <CarteLegislatives blocColors={BLOC_COLORS} swingDelta={swingDelta} />
    </div>
  );
}

export default App;
