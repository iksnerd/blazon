import picocolors from 'picocolors';

/**
 * Whether output may use ANSI color: for a terminal, unless NO_COLOR is set, TERM is dumb or `--no-color` was given; FORCE_COLOR turns it on
 * for a pipe (NO_COLOR still wins). The color library decides this on its own and reads any `--color` argument as "force color", which is
 * what `blazon init --color <hex>` is not, so blazon decides and hands the library the answer.
 */
export function colorWanted(env: NodeJS.ProcessEnv, tty: boolean, argv: readonly string[]): boolean {
  const off = (env['NO_COLOR'] ?? '') !== '' || env['TERM'] === 'dumb' || argv.includes('--no-color');
  const forced = (env['FORCE_COLOR'] ?? '') !== '' && env['FORCE_COLOR'] !== '0';
  return !off && (tty || forced);
}

/** The color functions every command writes with. */
const pc = picocolors.createColors(colorWanted(process.env, Boolean(process.stdout.isTTY), process.argv));
export default pc;
