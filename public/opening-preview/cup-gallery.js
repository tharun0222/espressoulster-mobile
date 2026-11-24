import { animateDiner } from './diner-3d.js';

const shapes = [
  ['Matte tumbler', 'M24 37h76l-7 93q-1 6-7 6H38q-6 0-7-6Z', 'M20 29h84v13H20Z'],
  ['Espresso demitasse', 'M26 47h66v34q0 25-33 25T26 81Z', 'M91 55h8a12 12 0 0 1 0 24h-9', 64],
  ['Flat white bowl', 'M13 45h98Q103 106 62 106T13 45Z', '', 65],
  ['Diner mug', 'M21 36h74v72q0 14-15 14H36q-15 0-15-14Z', 'M94 50h9a15 15 0 0 1 0 30h-9'],
  ['Tall latte', 'M27 24h70L82 135H42Z'],
  ['Iced dome', 'M20 42h84l-14 90H34Z', 'M19 42q1-24 39-25l7-13 5 2-5 11q39 2 40 25Z'],
  ['Travel flask', 'M28 47q0-12 16-15h36q16 3 16 15v76q0 12-12 12H40q-12 0-12-12Z', 'M42 14h40v21H42Z'],
  ['Camp mug', 'M15 43h79v62q0 10-10 10H25q-10 0-10-10Z', 'M94 52h17v34H94'],
  ['Stemmed mocha', 'M21 29h82Q96 84 67 98v24h24v6H33v-6h24V98Q28 84 21 29Z', '', 54],
  ['Pour-over glass', 'M19 28h86L80 71q22 14 22 46 0 13-15 13H37q-15 0-15-13 0-32 22-46Z', '', 99],
];

const finishes = [
  ['Espresso', '#2b211c', '#ffab87', '#fff5e5'],
  ['Oat', '#f2ddbd', '#9b3d1f', '#352218'],
  ['Terracotta', '#a74127', '#ffc39a', '#fff8ec'],
  ['Sage', '#396354', '#d5e6c5', '#fff8ec'],
  ['Midnight', '#28324e', '#b6caff', '#fff8ec'],
];

const cupMotions = ['tumbler', 'demitasse', 'bowl', 'diner', 'latte',
  'iced', 'flask', 'camp', 'mocha', 'pourover'];

const stage = document.querySelector('main');
const selectedCup = document.querySelector('#selected-cup');
const options = document.querySelector('#cup-options');
let selectedButton;

function replay() {
  stage.classList.remove('play');
  void stage.offsetWidth;
  stage.classList.add('play');
  const model = selectedCup.querySelector('canvas');
  if (model) {
    const freshModel = model.cloneNode();
    model.replaceWith(freshModel);
    animateDiner(freshModel);
  }
}


for (const [shapeIndex, [shape, silhouette, trim, logoY = 74]] of shapes.entries()) {
  for (const [finishIndex, [finish, body, accent, ink]] of finishes.entries()) {
    const number = String(shapeIndex * finishes.length + finishIndex + 1).padStart(2, '0');
    const name = number + ' · ' + finish + ' ' + shape;
    const motion = cupMotions[shapeIndex];
    const cup = number === '16' ? `<svg class="outlet-cup" data-motion="diner" viewBox="0 0 124 145" aria-hidden="true">
      <defs>
        <linearGradient id="diner-glaze">
          <stop stop-color="#211510"/><stop offset=".28" stop-color="#634337"/>
          <stop offset=".55" stop-color="#3a2821"/><stop offset="1" stop-color="#1e1411"/>
        </linearGradient>
        <radialGradient id="diner-coffee">
          <stop stop-color="#b77342"/><stop offset="1" stop-color="#4c2515"/>
        </radialGradient>
      </defs>
      <path d="M92 54c33-8 35 34 0 34" fill="none" stroke="#251711" stroke-width="10"/>
      <path d="M94 53c28-7 30 31 0 33" fill="none" stroke="#69483b" stroke-width="3"/>
      <path d="M20 38h77l-4 67q0 18-34 18t-35-18Z" fill="url(#diner-glaze)"/>
      <ellipse cx="58.5" cy="38" rx="38.5" ry="12" fill="#886351"/>
      <ellipse cx="58.5" cy="39" rx="34" ry="8.5" fill="url(#diner-coffee)"/>
      <path d="M28 51l3 45" fill="none" stroke="#fff5e5" stroke-opacity=".12" stroke-width="2" stroke-linecap="round"/>
      <text x="58" y="76" text-anchor="middle" fill="#fff5e5" font-size="6" font-weight="800">ESPRESSOULSTER</text>
      <text x="58" y="86" text-anchor="middle" fill="#ffab87" font-size="5" letter-spacing="1">COFFEE</text>
    </svg>` : `<svg class="outlet-cup" data-motion="${motion}" viewBox="0 0 124 145" aria-hidden="true">
      <path d="${silhouette}" fill="${body}"/>
      <path d="${trim || ''}" fill="none" stroke="${body}" stroke-width="4" stroke-linejoin="round"/>
      <text x="62" y="${logoY}" text-anchor="middle" fill="${ink}" font-size="6" font-weight="800">ESPRESSOULSTER</text>
      <text x="62" y="${logoY + 9}" text-anchor="middle" fill="${accent}" font-size="5" letter-spacing="1">COFFEE</text>
    </svg>`;
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = cup.replaceAll('diner-glaze', 'diner-glaze-thumbnail')
      .replaceAll('diner-coffee', 'diner-coffee-thumbnail') + name;
    button.addEventListener('click', () => {
      selectedButton?.setAttribute('aria-pressed', 'false');
      selectedButton = button;
      button.setAttribute('aria-pressed', 'true');
      selectedCup.innerHTML = number === '16'
        ? '<canvas class="outlet-cup" width="248" height="290" role="img" aria-label="Rotating 3D Espresso Diner Mug"></canvas>'
        : cup;
      replay();
    });
    options.append(button);
  }
}

options.children[15].click();
