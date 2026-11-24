import { vi } from 'vitest';

// The tests check the French texts: the interface language (i18n.ts) follows the browser's,
// English under Node.
vi.stubGlobal('navigator', { ...globalThis.navigator, language: 'fr-FR', languages: ['fr-FR'] });
