// Interface icons (our own, 24x24, stroke-based). The app mark is the one place the sunset gradient appears.
const I = (d: string, extra = '') => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const ICONS = {
  mark: `<svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
    <defs>
      <linearGradient id="sunset" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffb86b"/><stop offset=".5" stop-color="#ff7aa2"/><stop offset="1" stop-color="#8b5cf6"/>
      </linearGradient>
      <clipPath id="sun-cut"><path d="M0 0h40v22.5H0zM0 25h40v2.6H0zM0 30h40v2H0zM0 34.2h40v1.5H0z"/></clipPath>
    </defs>
    <rect width="40" height="40" rx="11" fill="#1d1838"/>
    <circle cx="20" cy="22" r="12" fill="url(#sunset)" clip-path="url(#sun-cut)"/>
  </svg>`,
  search: I('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  close: I('<path d="M6 6l12 12M18 6 6 18"/>'),
  info: I('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.2"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  minus: I('<path d="M5 12h14"/>'),
  compass: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3.2 15.2 12H8.8z" fill="#ff8fb1"/><path d="M12 20.8 8.8 12h6.4z" fill="currentColor" opacity=".55"/></svg>`,
  cube: I('<path d="M12 3.5 19.5 7.7v8.6L12 20.5l-7.5-4.2V7.7z"/><path d="M4.8 7.9 12 12l7.2-4.1M12 12v8.3"/>'),
  fit: I('<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>'),
  chevron: I('<path d="m9.5 6 6 6-6 6"/>', 'width="16" height="16"'),
  back: I('<path d="M14.5 6l-6 6 6 6"/>', 'width="18" height="18"'),
  check: I('<path d="m5.5 12.5 4 4 9-9"/>', 'width="14" height="14" stroke-width="2.6"'),
  pin: I('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>', 'width="18" height="18"'),
  target: I('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>', 'width="18" height="18"'),
  link: I('<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>', 'width="18" height="18"'),
  github: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2.2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 2.9.8.1-.7.4-1.1.7-1.3-2.2-.3-4.6-1.1-4.6-5a3.9 3.9 0 0 1 1-2.7c-.1-.3-.5-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .6 1.4.2 2.4.1 2.7a3.9 3.9 0 0 1 1 2.7c0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2.2z"/></svg>`,
};
