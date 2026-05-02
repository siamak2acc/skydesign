const navToggle = document.querySelector('.nav-toggle');
const siteNav = document.querySelector('#site-nav');
const iataInputs = document.querySelectorAll('.iata-input');
const homeSearchForm = document.querySelector('#home-flight-search');
const homeResults = document.querySelector('#home-results');
const homePopularResults = document.querySelector('#home-popular-results');
const homeDealGrid = document.querySelector('#home-deal-grid');
const homePopularGrid = document.querySelector('#home-popular-grid');
const homeResultsMessage = document.querySelector('#home-results-message');
const homeFallback = document.querySelector('#home-fallback');
const homeFallbackLink = document.querySelector('#home-fallback-link');
const popularSearchButtons = document.querySelectorAll('.popular-search-button');
const NO_CACHED_MESSAGE = 'No cached price is available for this exact route/date. Continue to live search for the latest fares.';

if (navToggle && siteNav) {
  navToggle.addEventListener('click', () => {
    const isOpen = siteNav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });
}

iataInputs.forEach((input) => {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 3);
  });
});

function getNextMonthValue(offset = 1) {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function setText(element, value) {
  element.textContent = value || '';
}

function formatStops(transfers) {
  if (transfers === 0) {
    return 'Direct';
  }

  if (typeof transfers === 'number') {
    return `${transfers} ${transfers === 1 ? 'stop' : 'stops'}`;
  }

  return 'Not specified';
}

function createDetail(label, value) {
  const row = document.createElement('div');
  const dt = document.createElement('dt');
  const dd = document.createElement('dd');

  setText(dt, label);
  setText(dd, value);
  row.append(dt, dd);
  return row;
}

function createDealCard(deal, fetchedAt) {
  const article = document.createElement('article');
  article.className = 'deal-card';

  const header = document.createElement('div');
  header.className = 'deal-card-header';

  const route = document.createElement('p');
  route.className = 'route-code';
  setText(route, `${deal.origin || ''} to ${deal.destination || ''}`);

  const price = document.createElement('h3');
  const currency = document.createElement('span');
  setText(currency, deal.currency || '');
  price.append(currency, ` ${Number(deal.price || 0).toLocaleString('en-AU')}`);

  header.append(route, price);

  const details = document.createElement('dl');
  details.append(createDetail('Departure', deal.departDate || 'Flexible'));

  if (deal.returnDate) {
    details.append(createDetail('Return', deal.returnDate));
  }

  details.append(createDetail('Airline', deal.airline || 'Any airline'));
  details.append(createDetail('Stops', formatStops(deal.transfers)));

  if (deal.foundAt || fetchedAt) {
    details.append(createDetail('Last updated', deal.foundAt || fetchedAt));
  }

  const link = document.createElement('a');
  link.className = 'button button-primary';
  link.href = deal.dealUrl || '/flight-deal-finder';
  link.rel = 'nofollow sponsored';
  setText(link, 'View Deal');

  article.append(header, details, link);
  return article;
}

function renderDealCards(grid, deals, fetchedAt) {
  grid.replaceChildren();
  deals.forEach((deal) => {
    grid.appendChild(createDealCard(deal, fetchedAt));
  });
}

function setFallback(url) {
  if (!homeFallback || !homeFallbackLink) {
    return;
  }

  homeFallback.hidden = false;
  homeFallbackLink.href = url || '/flight-deal-finder';
  setText(homeFallbackLink, 'Continue to live search');
}

function showHomeMessage(message) {
  if (!homeResultsMessage) {
    return;
  }

  homeResultsMessage.hidden = false;
  setText(homeResultsMessage, message || NO_CACHED_MESSAGE);
}

async function runHomeSearch(formData) {
  if (!homeResults || !homeDealGrid || !homePopularResults || !homePopularGrid) {
    return;
  }

  const params = new URLSearchParams(formData);
  homeResults.hidden = false;
  homePopularResults.hidden = true;
  homeDealGrid.replaceChildren();
  homePopularGrid.replaceChildren();
  homeResultsMessage.hidden = true;
  homeFallback.hidden = true;
  showHomeMessage('Searching cached fares...');

  let payload = null;

  try {
    const response = await fetch(`/api/flight-prices?${params.toString()}`, {
      headers: { Accept: 'application/json' }
    });
    payload = await response.json();
  } catch (error) {
    payload = {
      results: [],
      popularResults: [],
      fallbackUrl: `/flight-deal-finder?${params.toString()}`,
      message: NO_CACHED_MESSAGE
    };
  }

  const results = Array.isArray(payload.results) ? payload.results : [];
  const popularResults = Array.isArray(payload.popularResults) ? payload.popularResults : [];

  if (results.length > 0) {
    homeResultsMessage.hidden = true;
    renderDealCards(homeDealGrid, results, payload.fetchedAt);
  } else {
    homeDealGrid.replaceChildren();
    showHomeMessage(payload.message || NO_CACHED_MESSAGE);
    setFallback(payload.fallbackUrl || `/flight-deal-finder?${params.toString()}`);
  }

  if (popularResults.length > 0) {
    homePopularResults.hidden = false;
    renderDealCards(homePopularGrid, popularResults, payload.fetchedAt);
  }

  if (results.length > 0 && payload.fallbackUrl) {
    setFallback(payload.fallbackUrl);
  }

  homeResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

if (homeSearchForm) {
  homeSearchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    runHomeSearch(new FormData(homeSearchForm));
  });
}

popularSearchButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const card = button.closest('.popular-route-card');
    if (!homeSearchForm || !card) {
      return;
    }

    homeSearchForm.elements.origin.value = card.dataset.origin || '';
    homeSearchForm.elements.destination.value = card.dataset.destination || '';
    homeSearchForm.elements.depart_date.value = getNextMonthValue(1);
    homeSearchForm.elements.return_date.value = getNextMonthValue(2);
    homeSearchForm.elements.adults.value = '1';
    homeSearchForm.elements.currency.value = 'AUD';
    runHomeSearch(new FormData(homeSearchForm));
  });
});
