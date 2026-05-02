require('dotenv').config();

const express = require('express');
const path = require('path');

const app = express();

const PORT = process.env.PORT || 3000;
const AVIASALES_PRICES_FOR_DATES_URL = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';
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
    popularResults: [],
    searched: false,
    apiError: '',
    currency: 'AUD',
    fetchedAt: '',
    noCachedData: false,
    noCachedDataMessage: '',
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

function buildAviasalesSearchUrl(search) {
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

  url.searchParams.set('adults', search.adults || '1');
  url.searchParams.set('children', '0');
  url.searchParams.set('infants', '0');
  url.searchParams.set('trip_class', '0');
  url.searchParams.set('one_way', search.return_date ? 'false' : 'true');
  url.searchParams.set('locale', 'en');
  url.searchParams.set('lang', 'en');

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
  const datePattern = /^\d{4}-\d{2}(?:-\d{2})?$/;

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

function toMonth(dateValue) {
  return String(dateValue || '').slice(0, 7);
}

function isExactDate(dateValue) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ''));
}

function normalizeTravelpayoutsResults(payload, search) {
  const sourceResults = Array.isArray(payload?.prices)
    ? payload.prices
    : Array.isArray(payload?.data)
      ? payload.data
      : [];

  return sourceResults
    .filter((item) => item && (item.value || item.price))
    .slice(0, 12)
    .map((item, index) => {
      const resultSearch = {
        origin: item.origin || search.origin,
        destination: item.destination || search.destination,
        depart_date: formatApiDate(item.departure_at || item.depart_date || search.depart_date),
        return_date: formatApiDate(item.return_at || item.return_date || search.return_date),
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
        flightNumber: item.flight_number || '',
        gate: item.gate || item.gate_id || '',
        foundAt: item.found_at || '',
        expiresAt: item.expires_at || '',
        dealUrl: buildAviasalesSearchUrl(resultSearch)
      };
    });
}

function formatApiDate(dateValue) {
  if (!dateValue) {
    return '';
  }

  return String(dateValue).slice(0, 10);
}

function buildTravelpayoutsUrl(search, overrides = {}) {
  const url = new URL(AVIASALES_PRICES_FOR_DATES_URL);
  url.searchParams.set('origin', search.origin);
  url.searchParams.set('destination', search.destination);
  url.searchParams.set('departure_at', overrides.departure_at || search.depart_date);
  url.searchParams.set('cy', search.currency.toLowerCase());
  url.searchParams.set('limit', '30');
  url.searchParams.set('sorting', 'price');
  url.searchParams.set('direct', 'false');
  url.searchParams.set('unique', 'false');
  url.searchParams.set('one_way', search.return_date ? 'false' : 'true');
  url.searchParams.set('page', '1');

  const returnAt = overrides.return_at || search.return_date;
  if (returnAt) {
    url.searchParams.set('return_at', returnAt);
  }

  return url;
}

function summarizeTravelpayoutsBody(payload, rawBody) {
  if (!payload || typeof payload !== 'object') {
    return {
      type: 'non_json',
      preview: String(rawBody || '').slice(0, 400)
    };
  }

  return {
    success: typeof payload.success === 'boolean' ? payload.success : undefined,
    error: payload.error || undefined,
    dataType: Array.isArray(payload.data) ? 'array' : typeof payload.data,
    dataCount: Array.isArray(payload.data) ? payload.data.length : undefined,
    pricesCount: Array.isArray(payload.prices) ? payload.prices.length : undefined,
    hasErrorsObject: !!payload.errors
  };
}

function createDebugInfo(search, url, status, payload, rawBody, cached) {
  return {
    endpointUrl: url.toString(),
    requestParams: {
      origin: search.origin,
      destination: search.destination,
      departure_at: url.searchParams.get('departure_at'),
      return_at: url.searchParams.get('return_at') || '',
      cy: url.searchParams.get('cy'),
      adults: search.adults,
      limit: url.searchParams.get('limit'),
      sorting: url.searchParams.get('sorting'),
      direct: url.searchParams.get('direct'),
      unique: url.searchParams.get('unique')
    },
    notes: [
      'TP_API_TOKEN is sent only in the X-Access-Token header and is never included in this debug output.',
      'Aviasales Data API is cache-based, so empty results can mean no cached price for this exact route/date.'
    ],
    travelpayoutsStatus: status,
    responseBodySummary: summarizeTravelpayoutsBody(payload, rawBody),
    cached
  };
}

async function requestTravelpayouts(url) {
  const response = await fetch(url, {
    headers: {
      'X-Access-Token': TP_API_TOKEN,
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate'
    }
  });
  const rawBody = await response.text();
  let payload = null;

  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch (error) {
    payload = null;
  }

  return {
    response,
    payload,
    rawBody
  };
}

async function attemptTravelpayoutsSearch(search, overrides = {}) {
  const url = buildTravelpayoutsUrl(search, overrides);
  const { response, payload, rawBody } = await requestTravelpayouts(url);
  const debug = createDebugInfo(search, url, response.status, payload, rawBody, false);

  if (!response.ok || payload?.success === false) {
    const message = payload?.error || `Travelpayouts API returned ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.debug = debug;
    throw error;
  }

  return {
    results: normalizeTravelpayoutsResults(payload, search),
    debug
  };
}

function buildSearchAttempts(search) {
  const attempts = [
    {
      label: 'exact',
      overrides: {
        departure_at: search.depart_date,
        return_at: search.return_date
      }
    }
  ];

  if (isExactDate(search.depart_date)) {
    attempts.push({
      label: 'month',
      overrides: {
        departure_at: toMonth(search.depart_date),
        return_at: search.return_date ? toMonth(search.return_date) : ''
      }
    });
  }

  return attempts;
}

async function fetchFlightPrices(search, options = {}) {
  const cacheKey = getCacheKey(search);
  const cached = getCachedPrices(cacheKey);
  const firstUrl = buildTravelpayoutsUrl(search);

  if (cached) {
    const response = { ...cached, cached: true };
    if (options.debug) {
      response.debug = createDebugInfo(search, firstUrl, 200, { data: cached.results || [] }, '', true);
    }
    return response;
  }

  if (!TP_API_TOKEN) {
    throw new Error('TP_API_TOKEN missing');
  }

  const debugAttempts = [];
  let results = [];
  let popularResults = [];

  for (const attempt of buildSearchAttempts(search)) {
    let data;

    try {
      data = await attemptTravelpayoutsSearch(search, attempt.overrides);
    } catch (error) {
      if (error.debug) {
        debugAttempts.push({
          label: attempt.label,
          ...error.debug
        });
      }
      error.debug = { attempts: debugAttempts };
      throw error;
    }

    debugAttempts.push({
      label: attempt.label,
      ...data.debug
    });

    if (data.results.length > 0 && attempt.label === 'exact') {
      results = data.results;
      break;
    }

    if (data.results.length > 0 && attempt.label === 'month') {
      popularResults = data.results;
      break;
    }
  }

  const noCachedData = results.length === 0;
  const responsePayload = {
    results,
    popularResults,
    fetchedAt: new Date().toISOString(),
    noCachedData,
    message: noCachedData ? 'No cached price is available for this exact route/date. Continue to live search for the latest fares.' : ''
  };
  setCachedPrices(cacheKey, responsePayload);

  return {
    ...responsePayload,
    cached: false,
    ...(options.debug ? { debug: { attempts: debugAttempts } } : {})
  };
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

app.get('/debug-aviasales-link', (req, res) => {
  const search = normalizeSearch(req.query);
  return res.json({ url: buildAviasalesSearchUrl(search) });
});

app.get('/', (req, res) => {
  renderPage(res, 'home', {
    activePath: '/',
    pageTitle: 'SkyDesign Flight Deals Australia | Find Cheap Flights',
    metaDescription: 'Search cheap flight deals from Australia, compare cached fares, and continue to live flight search with SkyDesign.'
  });
});

app.get('/api/flight-prices', async (req, res) => {
  const search = normalizeSearch(req.query);
  const errors = validateSearch(search);
  const fallbackUrl = buildAviasalesSearchUrl(search);
  const debugEnabled = req.query.debug === '1';

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      errors,
      results: [],
      popularResults: [],
      fallbackUrl
    });
  }

  try {
    const data = await fetchFlightPrices(search, { debug: debugEnabled });
    return res.json({
      success: true,
      ...data,
      fallbackUrl
    });
  } catch (error) {
    const isMissingToken = error.message === 'TP_API_TOKEN missing';
    const message = isMissingToken
      ? 'Travelpayouts API token is not configured.'
      : 'Travelpayouts API request failed. Use the Aviasales fallback search.';

    return res.status(502).json({
      success: false,
      error: message,
      results: [],
      popularResults: [],
      fallbackUrl,
      ...(debugEnabled && error.debug ? { debug: error.debug } : {})
    });
  }
});

app.get('/flight-deal-finder', async (req, res) => {
  const hasSearch = Object.keys(req.query).some((key) =>
    ['origin', 'destination', 'depart_date', 'return_date', 'currency', 'adults'].includes(key)
  );
  const search = normalizeSearch(req.query);
  const fallbackUrl = hasSearch ? buildAviasalesSearchUrl(search) : '';
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
      popularResults: data.popularResults || [],
      currency: search.currency,
      fetchedAt: data.fetchedAt,
      fallbackUrl,
      cached: data.cached,
      noCachedData: data.noCachedData,
      noCachedDataMessage: data.message
    });
  } catch (error) {
    return renderPage(res, 'flight-deal-finder', {
      ...baseOptions,
      searched: true,
      formValues: search,
      results: [],
      popularResults: [],
      currency: search.currency,
      fallbackUrl,
      apiError: 'Travelpayouts API request failed. Use the Aviasales fallback search.'
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
      fallbackUrl: buildAviasalesSearchUrl(search),
      error: errors.join(' ')
    });
  }

  return res.redirect(302, buildAviasalesSearchUrl(search));
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
