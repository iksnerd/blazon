import type { CAC } from 'cac';
import { refuse } from './errors.js';

/** The flag as it is written: `-o` for a one-letter name, `--outDir` for the rest. */
const flagOf = (name: string): string => (name.length === 1 ? `-${name}` : `--${name}`);

/**
 * Gives every text option the text that was typed. The parser turns a value that looks like a number into a number, and an empty one
 * into 0, so `--name ""` became the title "0" and `--name 007` became 7. A value that is not there at all is refused: an
 * empty value is nearly always an unset variable in a script. The options that name a port, and those that can repeat, are left alone.
 */
export function restoreOptionText(cli: CAC, argv: string[]): void {
  const command = cli.matchedCommand;
  if (!command) return;
  const options = [...command.options, ...cli.globalCommand.options].filter((option) => option.required);
  for (const option of options) {
    if (typeof cli.options[option.name] === 'object') continue;
    const flags = option.names.map(flagOf);
    for (let i = 2; i < argv.length; i++) {
      const token = argv[i]!;
      const flag = flags.find((f) => token === f || token.startsWith(`${f}=`));
      if (flag === undefined) continue;
      const text = token === flag ? argv[i + 1] : token.slice(flag.length + 1);
      if (text === undefined) continue;
      if (text === '') refuse(`blazon ${command.name}: ${flag} needs a value, not an empty one.`, 'empty-value', { fix: `Give ${flag} a value, or leave it out.` });
      // A port is a number: it keeps the parser's, and is only refused when it is empty
      if (option.name !== 'port') for (const name of option.names) if (name in cli.options) cli.options[name] = text;
    }
  }
  // An empty word that is not an option's value is an empty argument: the parser would read it as 0, and a folder named 0 as nothing
  const words = argv.slice(2);
  if (words.some((word, i) => word === '' && !(words[i - 1] ?? '').startsWith('-'))) {
    refuse(
      `blazon ${command.name}: ${command.rawName.includes('[dir]') ? 'the folder is an empty name; leave it out to use the current folder' : 'an argument is empty'}.`,
      'empty-value',
      { fix: 'Leave the empty argument out, or give it a value.' },
    );
  }
}
