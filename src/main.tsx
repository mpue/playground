import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { captureSelf, readEmbedded } from './model/share';
import { PlayerPage, seededDb } from './ui/run/PlayerPage';
import './styles.css';

// Before React touches the page: keep a clean copy of this HTML for "export as app".
captureSelf();

const embedded = readEmbedded();
const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    {embedded ? (
      <PlayerPage
        project={embedded.project}
        db={seededDb(`aquist.db.embedded.${embedded.project.id}`, embedded.data)}
        embedded
      />
    ) : (
      <App />
    )}
  </StrictMode>,
);
