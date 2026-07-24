import React from 'react';
import ReactDOM from 'react-dom/client';
import DApp from './dApp.jsx';
import './index.css';

// One page, mounted at whatever path it is served from. There was a
// BrowserRouter here with a single `/` route, which meant a router, a route
// table and a history listener to decide between one destination and itself,
// and it broke the moment the app was served anywhere but the domain root.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DApp />
  </React.StrictMode>,
);
