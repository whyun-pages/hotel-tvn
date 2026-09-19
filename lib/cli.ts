export type ArgValueMap = Record<string, string | true>;

export interface ValueOption {
  long: string;
  short?: string;
}

export interface ParseArgsResult {
  values: ArgValueMap;
  positionals: string[];
  help: boolean;
  error?: string;
}

export function parseArgs(
  args: string[],
  valueOptions: ValueOption[]
): ParseArgsResult {
  const values: ArgValueMap = {};
  const positionals: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--') {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (arg === '-h' || arg === '--help') {
      return { values, positionals, help: true };
    }
    if (!arg.startsWith('-')) {
      positionals.push(arg);
      continue;
    }

    const inlineValueIndex = arg.indexOf('=');
    const flag =
      inlineValueIndex === -1 ? arg : arg.slice(0, inlineValueIndex);
    const spec = valueOptions.find(
      (option) => option.long === flag || option.short === flag
    );

    if (spec == null) {
      return { values, positionals, help: false, error: `unknown option '${arg}'` };
    }

    const value =
      inlineValueIndex === -1 ? args[i + 1] : arg.slice(inlineValueIndex + 1);
    if (value == null || value.startsWith('-')) {
      return {
        values,
        positionals,
        help: false,
        error: `option '${flag}' argument missing`,
      };
    }
    values[spec.long] = value;
    if (inlineValueIndex === -1) {
      i += 1;
    }
  }

  return { values, positionals, help: false };
}

export function parseOptionalInt(
  value: string | true | undefined,
  optionName: string
): { value?: number; error?: string } {
  if (value == null || value === true) {
    return {};
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return { error: `option '${optionName}' expects a number` };
  }

  return { value: parsed };
}
