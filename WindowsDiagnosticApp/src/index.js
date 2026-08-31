const React = require('react');
const { createRoot } = require('react-dom/client');
const App = require('./App').default;

const root = createRoot(document.getElementById('root'));
root.render(React.createElement(App));
