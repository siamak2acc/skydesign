const navToggle = document.querySelector('.nav-toggle');
const siteNav = document.querySelector('#site-nav');
const flightSearchForm = document.querySelector('#flight-search-form');
const affiliateResult = document.querySelector('#affiliate-result');

if (navToggle && siteNav) {
  navToggle.addEventListener('click', () => {
    const isOpen = siteNav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });
}

function normalizeValue(value) {
  return String(value || '').trim();
}

function buildPlaceholderAffiliateUrl(formData) {
  const url = new URL('https://skydesign.com.au/affiliate-placeholder/');
  url.searchParams.set('source', 'skydesign');
  url.searchParams.set('from', normalizeValue(formData.get('from')));
  url.searchParams.set('to', normalizeValue(formData.get('to')));
  url.searchParams.set('departure_date', normalizeValue(formData.get('departureDate')));

  const returnDate = normalizeValue(formData.get('returnDate'));
  if (returnDate) {
    url.searchParams.set('return_date', returnDate);
  }

  url.searchParams.set('travellers', normalizeValue(formData.get('travellers')) || '1');
  url.searchParams.set('cabin_class', normalizeValue(formData.get('cabinClass')) || 'Economy');

  return url.toString();
}

if (flightSearchForm && affiliateResult) {
  flightSearchForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const affiliateUrl = buildPlaceholderAffiliateUrl(new FormData(flightSearchForm));
    affiliateResult.href = affiliateUrl;
    affiliateResult.textContent = affiliateUrl;
    affiliateResult.hidden = false;
  });
}
