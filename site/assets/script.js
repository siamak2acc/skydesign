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

if (flightSearchForm && affiliateResult) {
  flightSearchForm.addEventListener('submit', (event) => {
    event.preventDefault();

    affiliateResult.textContent = 'Live booking partner integration is being updated. Please check back shortly.';
    affiliateResult.hidden = false;
  });
}
