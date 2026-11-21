import { holdsEachShippedPlugin, holdsTheShippedPlugins } from '../../support/plugin-conformance';

// The conformance rules every plugin in plugins/blazon.* must meet (see test/support/plugin-conformance.ts), run here for blazon.print-book, blazon.brand-deck, blazon.tailwind and blazon.copy, and the checks on the plugins folder as a whole.

holdsTheShippedPlugins();
holdsEachShippedPlugin('decks');
