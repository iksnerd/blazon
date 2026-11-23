import type { HtmlTagDescriptor, Plugin, ViteDevServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { ASSET_URL_BASE, type Finding, type BlazonConfig, type BlazonData } from '../types/index.js';
import { compileBlazonData } from '../core/index.js';
import { serveAssetFiles } from './assets.js';
import { serveIconSets } from './icon-sets.js';
import { categoryDirs as categoryDirsOf } from '../core/assets/categories.js';
import { formatBrandJson } from '../core/brand/export.js';
import { BRAND_SCHEMA_FILE, formatBrandSchema } from '../core/brand/schema.js';
import { DATA_SCRIPT_ID, serializeBlazonData } from './data-script.js';
import { CONFIG_FILE, loadConfig } from '../core/config/index.js';
import { DevChecks } from '../plugins/roles/dev.js';
import { coalesce } from './coalesce.js';
import { ErrorReporter } from './error-reporter.js';
import { LOCK_FILE } from '../plugins/pins/lock.js';
import { BLAZON_LOCK, blazonIdentity, blazonPinFindings, type BlazonIdentity } from '../core/blazon-pin.js';
import { allMcpConfigs, mcpServerName, resolveMcpLaunch } from '../core/mcp-config.js';
import { inputFiles as projectFiles, projectInputs } from '../core/inputs.js';

/** How long the file events of a burst may be apart and still be one change: a `git checkout` of dozens of files sends one update, a save sends its own a moment later. */
const BURST_MS = 75;

/** "2 errors, 1 warning": what the check plugins found, counted by severity. */
function summarize(findings: Finding[]): string {
  const count = (severity: Finding['severity'], word: string) => {
    const n = findings.filter((f) => f.severity === severity).length;
    return n === 0 ? [] : [severity === 'info' ? `${n} info` : `${n} ${word}${n === 1 ? '' : 's'}`];
  };
  const parts = [...count('error', 'error'), ...count('warning', 'warning'), ...count('info', 'info')];
  return parts.length === 0 ? 'no findings' : parts.join(', ');
}

export function createBlazonVitePlugin(initialConfig: BlazonConfig, cwd: string = process.cwd()): Plugin {
  let server: ViteDevServer | null = null;
  let config = initialConfig;

  // The check plugins (RFC 0002 of blazon, section 2). They run after the core's findings have been sent, so the viewer
  // never waits on a process. `pluginFindings` is the last finished result for the files as they are; a change empties it.
  const checks = new DevChecks(cwd);
  // What the core finds is said in the terminal too, as it changes: the viewer shows it, but a terminal would be silent over a broken book
  const errors = new ErrorReporter();
  let pluginFindings: Finding[] = [];
  let lastSummary: string | undefined;
  let lastFailures = new Set<string>();
  // Which blazon this is cannot change while it runs, so ask once; the pin file itself is read at every compile
  let identity: { value: BlazonIdentity | null } | undefined;
  const withPin = (data: BlazonData): BlazonData => {
    identity ??= { value: blazonIdentity() };
    return { ...data, findings: [...data.findings, ...blazonPinFindings(cwd, identity.value)] };
  };
  const withPlugins = (data: BlazonData, found: Finding[]): BlazonData => ({ ...data, findings: [...data.findings, ...found] });

  return {
    name: 'vite-plugin-blazon',

    configureServer(devServer) {
      server = devServer;

      // A category may be scanned from a folder of its own, which can be anywhere: serve it and watch it
      const categoryDirs = () => categoryDirsOf(config.assets, cwd);
      // What is watched is what a compile reads (core/inputs.ts), as the config is now: a reload may move any of it
      const watchedDirs = () => projectInputs(config, cwd).flatMap((input) => (input.folder && !input.holdsOnly && !input.unwatched ? [input.path] : []));

      const configFiles = [path.resolve(cwd, CONFIG_FILE)];
      const lockFile = path.resolve(cwd, LOCK_FILE);
      const pinFile = path.resolve(cwd, BLAZON_LOCK);

      /** Run the check plugins for this compile and send a second update when they finish. A newer compile drops this one. */
      const runChecks = async (data: BlazonData) => {
        if (!checks.has(config)) {
          pluginFindings = [];
          return;
        }
        const found = await checks.check(data, config);
        if (found === undefined) return;
        pluginFindings = found;
        const summary = summarize(found);
        if (summary !== lastSummary) console.log(`[blazon] plugins: ${summary}`);
        lastSummary = summary;
        // Said once while it lasts: a failure that goes away and comes back is said again
        const failures = new Set(found.filter((f) => f.code === 'plugin-failed').map((f) => `[blazon] ${f.path}: ${f.message}`));
        for (const line of failures) if (!lastFailures.has(line)) console.error(line);
        lastFailures = failures;
        devServer.ws.send({ type: 'custom', event: 'blazon:update', data: withPlugins(data, found) });
      };

      // Single files that a compile reads: the resolver document and the token files it names (they may be anywhere in the
      // project), the logo and font files, and the icon sets' category files. Read again after each compile, so a file the
      // resolver stops naming stops being watched.
      let watchedFiles = new Set<string>();
      const refreshWatched = () => {
        const next = new Set(projectFiles(config, cwd));
        const dropped = [...watchedFiles].filter((file) => !next.has(file));
        if (dropped.length > 0) devServer.watcher.unwatch(dropped);
        devServer.watcher.add([...next].filter((file) => !watchedFiles.has(file)));
        watchedFiles = next;
      };

      // Watch token, doc and asset directories, and the config (theme, logo, fonts). A reload that moves one starts watching the new
      // folder and stops watching the old.
      let watchedDirList = watchedDirs();
      /** The folders a reload started to watch, until the watcher has them. `add` returns at once and the watcher reads the folder after. */
      let started: string[] = [];
      const refreshDirs = () => {
        const next = watchedDirs();
        const dropped = watchedDirList.filter((dir) => !next.includes(dir));
        if (dropped.length > 0) devServer.watcher.unwatch(dropped);
        const added = next.filter((dir) => !watchedDirList.includes(dir));
        devServer.watcher.add(added);
        started = [...started, ...added];
        watchedDirList = next;
      };
      // An edit made as soon as the page has its update must reach the watcher, so the update waits for the new folders to be watched. The
      // wait ends at the bound, so a folder that cannot be watched does not hold the page back.
      const WATCH_WAIT_MS = 3000;
      const untilWatching = async () => {
        const waiting = started;
        started = [];
        const deadline = Date.now() + WATCH_WAIT_MS;
        const watched = () => Object.keys(devServer.watcher.getWatched());
        while (Date.now() < deadline && waiting.some((dir) => watchedDirList.includes(dir) && !watched().includes(dir))) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      };
      devServer.watcher.add([...watchedDirList, ...configFiles, lockFile, pinFile]);
      refreshWatched();

      // The schema brand.json follows, beside it
      devServer.middlewares.use(`/${BRAND_SCHEMA_FILE}`, (req, res, next) => {
        if (req.method && req.method !== 'GET') return next();
        res.setHeader('Content-Type', 'application/schema+json; charset=utf-8');
        res.end(formatBrandSchema());
      });

      // The brand as it is now, compiled per request, so a tool can be written against the dev server
      devServer.middlewares.use('/brand.json', (req, res, next) => {
        if (req.method && req.method !== 'GET') return next();
        compileBlazonData(config, cwd).then(
          (fresh) => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(formatBrandJson(fresh, config, cwd));
          },
          (err: unknown) => {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'text/plain');
            res.end(`blazon could not compile the brand: ${err instanceof Error ? err.message : String(err)}`);
          },
        );
      });

      // How to register blazon-mcp in each client for this project, for the "Connect your agent" panel; the brand is this project's folder, and the
      // server is named after it (the title now, as a config reload may change it), as `blazon mcp --print-config` does
      devServer.middlewares.use('/__blazon/mcp-config', (req, res, next) => {
        if (req.method && req.method !== 'GET') return next();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(
          JSON.stringify({
            format: 'blazon-mcp-config',
            version: 1,
            brand: path.resolve(cwd),
            clients: allMcpConfigs(resolveMcpLaunch(), path.resolve(cwd), mcpServerName(config.title)),
          }),
        );
      });

      // Before /brand-assets, which would take the icon-sets path for one of its own; getters, so a config reload takes effect
      devServer.middlewares.use(
        `/${ASSET_URL_BASE}/icon-sets`,
        serveIconSets(() => config.iconSets ?? [], cwd),
      );
      // A getter, so a config reload that moves assetsDir takes effect
      devServer.middlewares.use(
        `/${ASSET_URL_BASE}`,
        serveAssetFiles(() => path.resolve(cwd, config.assetsDir), categoryDirs),
      );

      /** What one burst of file events asks for: the brand compiled again and one update sent, with a config reload first if the config changed. */
      const handleFileChanges = async (files: string[]) => {
        const isConfig = files.some((file) => configFiles.includes(file));
        if (isConfig) {
          let reloaded = true;
          try {
            config = await loadConfig(cwd);
          } catch (err) {
            // Half-way through an edit the config is often wrong: keep the last good one and say why. The viewer is still told
            // about this change (the plugin findings were emptied at the event), and compiles with the config it has.
            console.error(`[blazon] ${err instanceof Error ? err.message : String(err)}`);
            reloaded = false;
          }
          if (reloaded) refreshDirs();
        }
        // The resolver may now name other files, or none of those it did
        refreshWatched();
        await untilWatching();

        try {
          const freshData = withPin(await compileBlazonData(config, cwd));
          errors.report(freshData.findings, (line) => console.error(line));
          devServer.ws.send({
            type: 'custom',
            event: 'blazon:update',
            data: freshData,
          });
          void runChecks(freshData);
        } catch (err) {
          console.error('[blazon] HMR compile error:', err);
        }
      };

      // When the server starts: what is wrong already, and the first check, whose result a page that loads later is given
      void compileBlazonData(config, cwd).then(
        (data) => errors.report(withPin(data).findings, (line) => console.error(line)),
        () => undefined, // the page request says why it cannot compile
      );
      if (checks.has(config))
        void compileBlazonData(config, cwd).then(
          (data) => runChecks(withPin(data)),
          (err: unknown) => console.error('[blazon] check plugins:', err),
        );

      // A save is one event and a `git checkout` is dozens: the events of a burst are one change, handled once a moment after the last. A
      // failure is said here, not left as an unhandled rejection.
      const burst = coalesce<string>(BURST_MS, handleFileChanges, (err: unknown) => console.error('[blazon] file change:', err));
      devServer.httpServer?.once('close', () => burst.cancel());
      const onFileEvent = (filePath: string) => {
        const isConfig = configFiles.includes(filePath);
        // The locks are read again at every check, so a change to one needs a check and no config reload
        if (!isConfig && filePath !== lockFile && filePath !== pinFile && !watchedFiles.has(filePath) && !watchedDirs().some((dir) => filePath.startsWith(dir))) return;
        pluginFindings = [];
        // A check still running describes files that have changed: whatever happens next, even no new check, its answer is dropped. This is
        // at the event and not after the pause, so a stale answer is dropped at once and not sent in the 75 ms before the update.
        checks.supersede();
        burst.add(filePath);
      };
      devServer.watcher.on('change', onFileEvent);
      devServer.watcher.on('add', onFileEvent);
      devServer.watcher.on('unlink', onFileEvent);

      // The locks are often not there yet: `blazon pin` creates blazon.lock. On Linux the watcher watches a file by inode, so a file that
      // did not exist when the server started is never seen, however it is added. The project folder itself, not its tree, is watched
      // for these two names. A save may reach both this and the watcher; the burst makes them one change.
      const lockNames = new Set([path.basename(lockFile), path.basename(pinFile)]);
      try {
        const rootWatch = fs.watch(cwd, (_event, name) => {
          if (name && lockNames.has(String(name))) onFileEvent(path.resolve(cwd, String(name)));
        });
        rootWatch.on('error', () => undefined);
        devServer.httpServer?.once('close', () => rootWatch.close());
      } catch {
        // No folder watch here: the watcher above still sees a lock that exists
      }
    },

    // 'pre', so Vite turns the dev bridge into a real module with import.meta.hot
    transformIndexHtml: {
      order: 'pre',
      async handler(html) {
        const data = withPin(await compileBlazonData(config, cwd));
        const tags: HtmlTagDescriptor[] = [
          {
            tag: 'script',
            attrs: { id: DATA_SCRIPT_ID, type: 'application/json' },
            children: serializeBlazonData(withPlugins(data, pluginFindings)),
            injectTo: 'head',
          },
        ];
        // The prebuilt viewer has no import.meta.hot of its own; this relays live updates to it as a DOM event
        if (server) {
          tags.push({
            tag: 'script',
            attrs: { type: 'module' },
            children: "import.meta.hot?.on('blazon:update', (data) => window.dispatchEvent(new CustomEvent('blazon:update', { detail: data })));",
            injectTo: 'head',
          });
        }
        return { html, tags };
      },
    },
  };
}
