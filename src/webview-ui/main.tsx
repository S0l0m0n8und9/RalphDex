import { createRoot } from 'react-dom/client';
import { App, type WebviewUiMode } from './App';
import type { RalphDashboardState } from '../ui/uiTypes';
import './styles/main.css';

interface BootstrapPayload {
  mode: WebviewUiMode;
  state: RalphDashboardState;
}

function readBootstrap(): BootstrapPayload {
  const node = document.getElementById('ralph-webview-bootstrap');
  if (!node?.textContent) {
    throw new Error('Missing Ralphdex webview bootstrap state.');
  }
  return JSON.parse(node.textContent) as BootstrapPayload;
}

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing Ralphdex webview root element.');
}

const bootstrap = readBootstrap();
createRoot(root).render(<App mode={bootstrap.mode} initialState={bootstrap.state} />);
