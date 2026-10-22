import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GameController } from './app';
import { DemoGame } from './content/demo';
import { App } from './ui/shell';
import './ui/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing from index.html');

// The clock only picks which seed a new run gets; everything after that is deterministic.
const controller = new GameController(new DemoGame(), () => Date.now());

createRoot(root).render(
  <StrictMode>
    <App model={controller} />
  </StrictMode>,
);
