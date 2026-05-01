require('dotenv').config();

const express = require('express');
const path = require('path');

const app = express();

const PORT = process.env.PORT || 3000;
const TRAVELPAYOUTS_API_URL = 'https://api.travelpayouts.com/v2/prices/nearest-places-matrix';
const AVIASALES_SEARCH_URL = 'https://search.aviasales.com/flights/';
const TP_MARKER = process.env.TP_MARKER || '';
const TP_API_TOKEN = process.env.TP_API_TOKEN || '';
const TP_WIDGET_EMBED_URL = process.env.TP_WIDGET_EMBED_URL || '';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const flightPriceCache = new Map();

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
    fallbackUrl: '',
    results: [],
    searched: false,
    apiError: '',
    currency: 'AUD',
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
  if (TP_MARKER) {
    url.searchParams.set('marker', TP_MARKER);
  }

  url.searchParams.set('origin_iata', search.origin);
  url.searchParams.set('destination_iata', search.destination);
  url.searchParams.set('depart_date', search.depart_date);

  if (search.return_date) {
    url.searchParams.set('return_date', search.return_date);
  }

  url.searchParams.set('adults', search.adults);

  return url.toString();
}

function normalizeSearch(body) {
  return {
    origin: String(body.origin || body.originIata || '').trim().toUpperCase(),
    destination: String(body.destination || body.destinationIata || '').trim().toUpperCase(),
    depart_date: body.depart_date || body.departDate || '',
    return_date: body.return_date || body.returnDate || '',
    currency: String(body.currency || 'AUD').trim().toUpperCase(),
    adults: body.adults || '1'
  };
}

function validateSearch(search, options = {}) {
  const errors = [];
  const iataPattern = /^[A-Z]{3}$/;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!iataPattern.test(search.origin)) {
    errors.push('Enter a valid 3-letter origin IATA code.');
  }

  if (!iataPattern.test(search.destination)) {
    errors.push('Enter a valid 3-letter destination IATA code.');
  }

  if (!datePattern.test(search.depart_date)) {
    errors.push('Choose a departure date.');
  }

  if (search.return_date && !datePattern.test(search.return_date)) {
    errors.push('Choose a valid return date.');
  }

  if (!/^[A-Z]{3}$/.test(search.currency)) {
    errors.push('Enter a valid 3-letter currency code.');
  }

  if (!/^[1-9]$/.test(String(search.adults))) {
    errors.push('Adults must be between 1 and 9.');
  }

  if (!TP_MARKER && options.requireMarker !== false) {
    errors.push('Travelpayouts marker is not configured. Set TP_MARKER in the server environment.');
  }

  if (!TP_API_TOKEN && options.requireToken) {
    errors.push('Travelpayouts API token is not configured.');
  }

  return errors;
}

function getCacheKey(search) {
  return JSON.stringify({
    origin: search.origin,
    destination: search.destination,
    depart_date: search.depart_date,
    return_date: search.return_date,
    currency: search.currency,
    adults: search.adults
  });
}

function getCachedPrices(cacheKey) {
  const cached = flightPriceCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (Date.now() - cached.createdAt > CACHE_TTL_MS) {
    flightPriceCache.delete(cacheKey);
    return null;
  }

  return cached.payload;
}

function setCachedPrices(cacheKey, payload) {
  flightPriceCache.set(cacheKey, {
    createdAt: Date.now(),
    payload
  });
}

function normalizeTravelpayoutsResults(payload, search) {
  const sourceResults = Array.isArray(payload.prices)
    ? payload.prices
    : Array.isArray(payload.data)
      ? payload.data
      : [];

  return sourceResults
    .filter((item) => item && (item.value || item.price))
    .slice(0, 12)
    .map((item, index) => {
      const resultSearch = {
        origin: item.origin || search.origin,
        destination: item.destination || search.destination,
        depart_date: item.depart_date || search.depart_date,
        return_date: item.return_date || search.return_date,
        adults: search.adults
      };

      return {
        id: `${resultSearch.origin}-${resultSearch.destination}-${resultSearch.depart_date}-${index}`,
        origin: resultSearch.origin,
        destination: resultSearch.destination,
        departDate: resultSearch.depart_date,
        returnDate: resultSearch.return_date,
        price: item.value || item.price,
        currency: search.currency,
        transfers: typeof item.number_of_changes === 'number' ? item.number_of_changes : item.transfers,
        airline: item.airline || '',
        gate: item.gate || '',
        foundAt: item.found_at || '',
        dealUrl: buildAviasalesUrl(resultSearch)
      };
    });
}

async function fetchFlightPrices(search) {
  const cacheKey = getCacheKey(search);
  const cached = getCachedPrices(cacheKey);

  if (cached) {
    return { ...cached, cached: true };
  }

  if (!TP_API_TOKEN) {
    throw new Error('TP_API_TOKEN missing');
  }

  const url = new URL(TRAVELPAYOUTS_API_URL);
  url.searchParams.set('origin', search.origin);
  url.searchParams.set('destination', search.destination);
  url.searchParams.set('depart_date', search.depart_date);
  url.searchParams.set('currency', search.currency);
  url.searchParams.set('show_to_affiliates', 'true');
  url.searchParams.set('limit', '10');
  url.searchParams.set('distance', '1');

  if (search.return_date) {
    url.searchParams.set('return_date', search.return_date);
  }

  const response = await fetch(url, {
    headers: {
      'X-Access-Token': TP_API_TOKEN,
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate'
    }
  });

  if (!response.ok) {
    throw new Error(`Travelpayouts API returned ${response.status}`);
  }

  const payload = await response.json();
  const results = normalizeTravelpayoutsResults(payload, search);
  const responsePayload = { results, fetchedAt: new Date().toISOString() };
  setCachedPrices(cacheKey, responsePayload);

  return { ...responsePayload, cached: false };
}

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'skydesign-flight-deal-finder'
  });
});

app.get('/env-check', (req, res) => {
  res.status(200).json({
    TP_MARKER: TP_MARKER ? 'OK' : 'MISSING',
    TP_API_TOKEN: TP_API_TOKEN ? 'OK' : 'MISSING'
  });
});

app.get('/', (req, res) => {
  renderPage(res, 'home', {
    activePath: '/',
    pageTitle: 'SkyDesign Flight Deal Finder',
    metaDescription: 'Search flexible flight deal ideas and compare cheap flights from Australia.'
  });
});

app.get('/api/flight-prices', async (req, res) => {
  const search = normalizeSearch(req.query);
  const errors = validateSearch(search);
  const fallbackUrl = buildAviasalesUrl(search);

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      errors,
      results: [],
      fallbackUrl
    });
  }

  try {
    const data = await fetchFlightPrices(search);
    return res.json({
      success: true,
      ...data,
      fallbackUrl
    });
  } catch (error) {
    return res.status(502).json({
      success: false,
      error: 'Flight price lookup is temporarily unavailable.',
      results: [],
      fallbackUrl
    });
  }
});

app.get('/flight-deal-finder', async (req, res) => {
  const hasSearch = Object.keys(req.query).some((key) =>
    ['origin', 'destination', 'depart_date', 'return_date', 'currency', 'adults'].includes(key)
  );
  const search = normalizeSearch(req.query);
  const fallbackUrl = hasSearch ? buildAviasalesUrl(search) : '';
  const baseOptions = {
    activePath: '/flight-deal-finder',
    pageTitle: 'Flight Deal Finder | SkyDesign',
    metaDescription: 'Use the SkyDesign flight deal finder to start a flight search.'
  };

  if (!hasSearch) {
    return renderPage(res, 'flight-deal-finder', baseOptions);
  }

  const errors = validateSearch(search);

  if (errors.length > 0) {
    return renderPage(res.status(400), 'flight-deal-finder', {
      ...baseOptions,
      searched: true,
      formValues: search,
      fallbackUrl,
      error: errors.join(' ')
    });
  }

  try {
    const data = await fetchFlightPrices(search);
    return renderPage(res, 'flight-deal-finder', {
      ...baseOptions,
      searched: true,
      formValues: search,
      results: data.results,
      currency: search.currency,
      fallbackUrl,
      cached: data.cached
    });
  } catch (error) {
    return renderPage(res, 'flight-deal-finder', {
      ...baseOptions,
      searched: true,
      formValues: search,
      results: [],
      currency: search.currency,
      fallbackUrl,
      apiError: 'Flight price lookup is temporarily unavailable.'
    });
  }
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
      fallbackUrl: buildAviasalesUrl(search),
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
