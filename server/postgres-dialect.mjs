// Translate the SQLite constructs used by the application, preserving its
// existing query strings, bindings, and D1 result shape.
const tokenPattern = /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'|"(?:[^"]|"")*"|[a-z_][a-z_0-9]*|\s+|./gi;
const helpers = new Set([
  'changes', 'datetime', 'julianday', 'unixepoch', 'strftime', 'printf', 'json',
  'json_each', 'json_extract', 'json_type', 'json_valid', 'json_set', 'json_remove',
  'json_object', 'json_array', 'json_group_array', 'min', 'max', 'substr',
]);
const integerJsonFields = new Set(["'$.price'", "'$.amount'", "'$.revision'", "'$.testPrice'", "'$.tableBookingFeePaise'", "'$.quantity'"]);
const skipped = token => /^\s+$|^--|^\/\*/.test(token);

function argumentLists(tokens, opening) {
  const lists = [];
  let depth = 0, from = opening + 1;
  for (let i = from; i < tokens.length; i++) {
    if (tokens[i] === '(') depth++;
    if (tokens[i] === ')') {
      if (depth === 0) {
        const last = tokens.slice(from, i);
        if (last.some(token => !skipped(token))) lists.push(last);
        return { lists, end:i };
      }
      depth--;
    }
    if (depth === 0 && tokens[i] === ',') {
      lists.push(tokens.slice(from, i));
      from = i + 1;
    }
  }
  throw new Error('Unclosed SQL function call');
}

function pgFunction(name, args, previousChanges) {
  switch (name) {
    case 'changes': return String(previousChanges);
    case 'datetime': return `cafe_datetime(${args.join(', ')})`;
    case 'julianday': return `cafe_julianday(${args.join(', ')})`;
    case 'unixepoch': return `cafe_epoch(${args.join(', ')})`;
    case 'strftime':
      if (args[0] === "'%Y-%m-%dT%H:%M:%fZ'") return `cafe_iso(${args.slice(1).join(', ')})`;
      if (args[0] === "'%s'") return `cafe_epoch(${args[1]})::text`;
      throw new Error('Unsupported SQLite date format');
    case 'printf':
      if (args[0] === "'%03d'") return `cafe_order_suffix(${args[1]})`;
      throw new Error('Unsupported SQLite number format');
    case 'json': return `(${args[0]})::jsonb`;
    case 'json_each': return `cafe_json_each(${args.join(', ')})`;
    case 'json_extract': return `cafe_json_${integerJsonFields.has(args[1]) ? 'number' : 'text'}(${args.join(', ')})`;
    case 'json_type': return `cafe_json_type(${args.join(', ')})`;
    case 'json_valid': return `cafe_json_valid(${args.join(', ')})`;
    case 'json_set': {
      let document = `(${args[0]})::jsonb`;
      for (let i = 1; i < args.length; i += 2) {
        document = `cafe_json_set(${document}, ${args[i]}, to_jsonb(${args[i+1]}))`;
      }
      return document;
    }
    case 'json_remove':
      return args.slice(1).reduce((document, field) => `(${document} #- cafe_json_path(${field}))`, `(${args[0]})::jsonb`);
    case 'json_object': return `jsonb_build_object(${args.join(', ')})`;
    case 'json_array': return `jsonb_build_array(${args.join(', ')})::text`;
    case 'json_group_array': return `COALESCE(jsonb_agg(${args[0]}), '[]'::jsonb)::text`;
    case 'min': return `${args.length > 1 ? 'LEAST' : 'MIN'}(${args.join(', ')})`;
    case 'max': return `${args.length > 1 ? 'GREATEST' : 'MAX'}(${args.join(', ')})`;
    case 'substr': return `substr(${args[0]}, ${args.slice(1).map(arg=>`(${arg})::integer`).join(', ')})`;
    default: throw new Error('Unsupported SQLite function');
  }
}

export function postgresStatement(source, values = [], previousChanges = 0) {
  const ignoresDuplicates = /^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(source);
  const sql = ignoresDuplicates ? source.replace(/^(\s*)INSERT\s+OR\s+IGNORE\s+INTO\b/i, '$1INSERT INTO') : source;
  let cursor = 0;
  const render = tokens => {
    let result = '', afterAs = false;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (skipped(token)) { result += token; continue; }
      const word = token.toLowerCase();
      let opening = i + 1;
      while (opening < tokens.length && skipped(tokens[opening])) opening++;
      if (helpers.has(word) && tokens[opening] === '(') {
        const { lists, end } = argumentLists(tokens, opening);
        result += pgFunction(word, lists.map(list => render(list).trim()), previousChanges);
        i = end;
      } else if (token === '?') {
        const value = values[cursor++];
        const nullTest = value == null && /^IS\s+(?:NOT\s+)?NULL\b/i.test(tokens.slice(opening).join(''));
        const cast = typeof value === 'string' || nullTest ? '::text'
          : typeof value === 'bigint' || Number.isSafeInteger(value) ? '::bigint'
          : typeof value === 'number' ? '::double precision' : '';
        result += '$' + cursor + cast;
      } else if (word === 'current_timestamp') {
        result += 'cafe_datetime()';
      } else if (afterAs && /^[a-z][a-z0-9]*[A-Z][a-zA-Z0-9]*$/.test(token)) {
        result += '"' + token + '"';
      } else {
        result += token;
      }
      afterAs = word === 'as';
    }
    return result;
  };
  let translated = render(sql.match(tokenPattern) ?? []).trim().replace(/;$/, '');
  if (cursor !== values.length) throw new Error('Incorrect SQL binding count');
  // SQLite permits a bare JOIN without ON. The booking hold query uses it
  // for a lateral cross join of the chosen table IDs.
  translated = translated.replace(/(FROM table_booking_payments p) JOIN cafe_json_each\(/i, '$1 CROSS JOIN LATERAL cafe_json_each(');
  return translated + (ignoresDuplicates ? ' ON CONFLICT DO NOTHING' : '');
}
