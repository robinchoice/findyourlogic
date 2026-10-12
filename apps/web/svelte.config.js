import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
export default {
  compilerOptions: { runes: true },
  kit: {
    adapter: adapter(),
    // SvelteKit adds nonces for its inline scripts. Browser errors go to
    // GlitchTip. New external sources (fonts, maps, APIs) go here.
    csp: {
      mode: 'auto',
      directives: {
        'default-src': ['self'],
        'script-src': ['self'],
        // The hash is that of an empty <style>: the feedback screenshot reads
        // web fonts through one. Content of any kind stays blocked.
        // The two others are the styles of the nostr-login dialog (Stencil
        // components). They change with a new nostr-login version, see AGENTS.md.
        'style-src': [
          'self',
          'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
          'sha256-PiWuRWkeIKh0uwqRLF8g4A8NphnSy0++QWlR9IDuCQY=',
          'sha256-+B0WpA9/97GdfkGWc6XgAornp44Du9oGCLP1k3dxuXE=',
        ],
        // Style attributes in app.html and in SvelteKit's route announcer
        'style-src-attr': ['unsafe-inline'],
        // nostr-login shows profile pictures from anywhere, talks to Nostr relays
        // (NIP-46 signers bring their own) and checks NIP-05 names on any domain.
        // New keys are made in an nsec.app frame.
        'img-src': ['self', 'data:', 'https:'],
        'connect-src': ['self', 'https:', 'wss:'],
        'frame-src': ['https://use.nsec.app', 'https://nsec.app'],
        'frame-ancestors': ['none'],
        'base-uri': ['self'],
        'form-action': ['self'],
        'object-src': ['none'],
      },
    },
  },
};
