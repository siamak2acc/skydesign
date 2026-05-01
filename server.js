require('dotenv').config();

const express = require('express');
const path = require('path');

const app = express();

const PORT = process.env.PORT || 3000;
const SITE_URL = process.env.SITE_URL || 'https://skydesign.com.au';
const AFFILIATE_BASE_URL =
  process.env.AFFILIATE_BASE_URL || `${SITE_URL.replace(/\/$/, '')}/affiliate-placeholder`;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));

const cabinClasses = ['Economy', 'Premium economy', 'Business', 'First'];

function renderPage(res, view, options = {}) {
  res.render(view, {
    activePath: options.activePath || '/',
    pageTitle: options.pageTitle || 'SkyDesign',
    metaDescription: options.metaDescription || 'Find smarter flight deals from Australia.',
    cabinClasses,
    ...options
  });
}

function buildAffiliateUrl(search) {
  const url = new URL(AFFILIATE_BASE_URL);
  url.searchParams.set('utm_source', 'skydesign');
  url.searchParams.set('utm_medium', 'flight_deal_finder');
  url.searchParams.set('utm_campaign', 'placeholder_redirect');

  for (const [key, value] of Object.entries(search)) {
    if (value) {
      url.searchParams.set(key, String(value).trim());
    }
  }

  return url.toString();
}

function normalizeSearch(body) {
  return {
    from: body.from || '',
    to: body.to || '',
    departureDate: body.departureDate || '',
    returnDate: body.returnDate || '',
    travellers: body.travellers || '1',
    cabinClass: body.cabinClass || 'Economy'
  };
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
  const missing = ['from', 'to', 'departureDate'].filter((field) => !search[field]);

  if (missing.length > 0) {
    return renderPage(res.status(400), 'flight-deal-finder', {
      activePath: '/flight-deal-finder',
      pageTitle: 'Flight Deal Finder | SkyDesign',
      metaDescription: 'Use the SkyDesign flight deal finder to start a flight search.',
      formValues: search,
      error: 'Please enter a departure city, destination, and departure date.'
    });
  }

  const affiliateUrl = buildAffiliateUrl(search);

  return renderPage(res, 'flight-deal-finder', {
    activePath: '/flight-deal-finder',
    pageTitle: 'Flight Deal Finder | SkyDesign',
    metaDescription: 'Use the SkyDesign flight deal finder to start a flight search.',
    formValues: search,
    affiliateUrl
  });
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
