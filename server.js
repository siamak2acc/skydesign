require('dotenv').config();

const express = require('express');
const path = require('path');

const app = express();

const PORT = process.env.PORT || 3000;
const AVIASALES_SEARCH_URL = 'https://search.aviasales.com/flights/';
const TP_MARKER = process.env.TP_MARKER || '';
const TP_WIDGET_EMBED_URL = process.env.TP_WIDGET_EMBED_URL || '';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));

function renderPage(res, view, options = {}) {
  res.render(view, {
    activePath: options.activePath || '/',
    pageTitle: options.pageTitle || 'SkyDesign',
    metaDescription: options.metaDescription || 'Find smarter flight deals from Australia.',
    widgetEmbedUrl: getTrustedWidgetEmbedUrl(),
    ...options
  });
}

function getTrustedWidgetEmbedUrl() {
  if (!TP_WIDGET_EMBED_URL) {
    return '';
  }

  try {
    const url = new URL(TP_WIDGET_EMBED_URL);
    const host = url.hostname.toLowerCase();
    const isTrustedHost =
      host === 'www.travelpayouts.com' ||
      host === 'travelpayouts.com' ||
      host.endsWith('.travelpayouts.com') ||
      host === 'www.aviasales.com' ||
      host === 'aviasales.com' ||
      host.endsWith('.aviasales.com');

    return isTrustedHost ? url.toString() : '';
  } catch (error) {
    return '';
  }
}

function buildAviasalesUrl(search) {
  const url = new URL(AVIASALES_SEARCH_URL);
  url.searchParams.set('marker', TP_MARKER);
  url.searchParams.set('origin_iata', search.originIata);
  url.searchParams.set('destination_iata', search.destinationIata);
  url.searchParams.set('depart_date', search.departDate);

  if (search.returnDate) {
    url.searchParams.set('return_date', search.returnDate);
  }

  url.searchParams.set('adults', search.adults);

  return url.toString();
}

function normalizeSearch(body) {
  return {
    originIata: String(body.originIata || '').trim().toUpperCase(),
    destinationIata: String(body.destinationIata || '').trim().toUpperCase(),
    departDate: body.departDate || '',
    returnDate: body.returnDate || '',
    adults: body.adults || '1'
  };
}

function validateSearch(search) {
  const errors = [];
  const iataPattern = /^[A-Z]{3}$/;

  if (!iataPattern.test(search.originIata)) {
    errors.push('Enter a valid 3-letter origin IATA code.');
  }

  if (!iataPattern.test(search.destinationIata)) {
    errors.push('Enter a valid 3-letter destination IATA code.');
  }

  if (!search.departDate) {
    errors.push('Choose a departure date.');
  }

  if (!/^[1-9]$/.test(String(search.adults))) {
    errors.push('Adults must be between 1 and 9.');
  }

  if (!TP_MARKER) {
    errors.push('Travelpayouts marker is not configured. Set TP_MARKER in the server environment.');
  }

  return errors;
}

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'skydesign-flight-deal-finder'
  });
});

app.get('/', (req, res) => {
  renderPage(res, 'home', {
    activePath: '/',
    pageTitle: 'SkyDesign Flight Deal Finder',
    metaDescription: 'Search flexible flight deal ideas and compare cheap flights from Australia.'
  });
});

app.get('/flight-deal-finder', (req, res) => {
  renderPage(res, 'flight-deal-finder', {
    activePath: '/flight-deal-finder',
    pageTitle: 'Flight Deal Finder | SkyDesign',
    metaDescription: 'Use the SkyDesign flight deal finder to start a flight search.'
  });
});

app.post('/flight-deal-finder', (req, res) => {
  const search = normalizeSearch(req.body);
  const errors = validateSearch(search);

  if (errors.length > 0) {
    return renderPage(res.status(400), 'flight-deal-finder', {
      activePath: '/flight-deal-finder',
      pageTitle: 'Flight Deal Finder | SkyDesign',
      metaDescription: 'Use the SkyDesign flight deal finder to start a flight search.',
      formValues: search,
      error: errors.join(' ')
    });
  }

  return res.redirect(302, buildAviasalesUrl(search));
});

app.get('/cheap-flights', (req, res) => {
  renderPage(res, 'cheap-flights', {
    activePath: '/cheap-flights',
    pageTitle: 'Cheap Flights | SkyDesign',
    metaDescription: 'Practical tips for finding cheap flights from Australia.'
  });
});

app.get('/about', (req, res) => {
  renderPage(res, 'about', {
    activePath: '/about',
    pageTitle: 'About | SkyDesign',
    metaDescription: 'Learn about SkyDesign and the flight deal finder project.'
  });
});

app.get('/contact', (req, res) => {
  renderPage(res, 'contact', {
    activePath: '/contact',
    pageTitle: 'Contact | SkyDesign',
    metaDescription: 'Contact SkyDesign about flight deal partnerships and website enquiries.'
  });
});

app.use((req, res) => {
  renderPage(res.status(404), '404', {
    activePath: '',
    pageTitle: 'Page Not Found | SkyDesign',
    metaDescription: 'The requested page could not be found.'
  });
});

app.listen(PORT, () => {
  console.log(`SkyDesign flight deal finder running on port ${PORT}`);
});
