const navToggle = document.querySelector('.nav-toggle');
const siteNav = document.querySelector('#site-nav');
const iataInputs = document.querySelectorAll('.iata-input');

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
