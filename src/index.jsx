import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/App';
import DetachedCanvas from './components/DetachedCanvas';
import './index.css';

const isDetached = new URLSearchParams(location.search).get('detached') === '1';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isDetached ? <DetachedCanvas /> : <App />}
  </React.StrictMode>
);
