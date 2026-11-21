import { holdsEachShippedPlugin } from '../../support/plugin-conformance';

// The conformance rules every plugin in plugins/blazon.* must meet (see test/support/plugin-conformance.ts), run here for blazon.press-kit, blazon.logo-kit and blazon.favicons.

holdsEachShippedPlugin('kits');
