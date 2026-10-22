import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BROWSER_GAMES } from './browser-games';
import { Launcher } from './ui/shell';
import { BrowserStore } from './ui/storage';
import './ui/theme/tokens.css';
import './ui/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing from index.html');

// The clock only picks which seed a launch gets; everything after that is deterministic.
createRoot(root).render(
  <StrictMode>
    <Launcher games={BROWSER_GAMES} nextSeed={() => Date.now()} store={new BrowserStore()} showDevGames={import.meta.env.DEV} />
  </StrictMode>,
);
