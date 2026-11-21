import { holdsEachShippedPlugin } from '../../support/plugin-conformance';

// The conformance rules every plugin in plugins/blazon.* must meet (see test/support/plugin-conformance.ts), run here for every other shipped plugin: blazon.social-cards, blazon.logo-geometry, blazon.platform-tokens, blazon.shadcn, blazon.office-template and any plugin added later.

holdsEachShippedPlugin('rest');
