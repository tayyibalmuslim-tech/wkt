/* Three-way snapshot reconciliation. No timestamps or changes to saved app data. */
const WaqtiSyncMerge = (() => {
  const absent = Symbol('absent');
  const own = (object, key) =>
    Object.prototype.hasOwnProperty.call(object, key);
  const object = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  const copy = (value) => (value === absent ? absent : structuredClone(value));
  function same(a, b) {
    if (a === undefined) a = absent;
    if (b === undefined) b = absent;
    if (a === b) return true;
    if (
      a === absent ||
      b === absent ||
      a === null ||
      b === null ||
      typeof a !== typeof b
    )
      return false;
    if (Array.isArray(a) || Array.isArray(b))
      return (
        Array.isArray(a) &&
        Array.isArray(b) &&
        a.length === b.length &&
        a.every((value, i) => same(value, b[i]))
      );
    if (!object(a) || !object(b)) return false;
    const keys = Object.keys(a).filter((key) => a[key] !== undefined);
    return (
      keys.length ===
        Object.keys(b).filter((key) => b[key] !== undefined).length &&
      keys.every((key) => own(b, key) && same(a[key], b[key]))
    );
  }
  const read = (value, key) =>
    value !== absent &&
    value != null &&
    own(value, key) &&
    value[key] !== undefined
      ? value[key]
      : absent;
  const put = (target, key, value) => {
    if (value !== absent)
      Object.defineProperty(target, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
  };
  const slotGroups = [
    ['$actual', ['slots', 'actualNotes', 'actualTasks']],
    [
      '$planned',
      [
        'planned',
        'plannedNotes',
        'taskSlotOwners',
        'taskSlotValues',
        'taskSlotNotes',
      ],
    ],
    ['$outcome', ['done', 'failed']],
  ];
  function merge(
    base,
    local,
    remote,
    { known = true, choices = new Map() } = {},
  ) {
    const conflicts = [];
    function clash(b, l, r, path) {
      const snapshot = (value) =>
        value === absent
          ? { exists: false }
          : { exists: true, value: copy(value) };
      const left = snapshot(l),
        right = snapshot(r);
      const token = JSON.stringify([path, left, right]);
      const choice = choices.get(token);
      if (choice === 'remote') return copy(r);
      if (choice !== 'local')
        conflicts.push({ path, local: left, remote: right, token });
      return copy(l);
    }
    function atom(b, l, r, path) {
      if (same(l, r)) return copy(l);
      if (known && same(l, b)) return copy(r);
      if (known && same(r, b)) return copy(l);
      return clash(b, l, r, path);
    }
    function visit(b, l, r, path) {
      if (same(l, r)) return copy(l);
      if (known && same(l, b)) return copy(r);
      if (known && same(r, b)) return copy(l);
      if (l === absent || r === absent) return clash(b, l, r, path);
      if (Array.isArray(l) && Array.isArray(r)) {
        const previous = Array.isArray(b) ? b : [];
        const keyed = [previous, l, r].every(
          (list) =>
            list.every((item) => object(item) && typeof item.id === 'string') &&
            new Set(list.map((item) => item.id)).size === list.length,
        );
        if (keyed) {
          const maps = [previous, l, r].map(
            (list) => new Map(list.map((item) => [item.id, item])),
          );
          const ids = [
            ...new Set([...l, ...r, ...previous].map((item) => item.id)),
          ];
          const items = new Map();
          for (const id of ids) {
            const value = visit(
              ...maps.map((map) => (map.has(id) ? map.get(id) : absent)),
              [...path, { id }],
            );
            if (value !== absent) items.set(id, value);
          }
          // Field edits and additions do not conflict with ordering unchanged on a device.
          const common = previous
            .map((item) => item.id)
            .filter((id) => maps[1].has(id) && maps[2].has(id));
          const commonSet = new Set(common);
          const order = (list) =>
            list.map((item) => item.id).filter((id) => commonSet.has(id));
          const left = order(l),
            right = order(r);
          let preferred = same(left, common) ? r : l;
          if (
            !same(left, common) &&
            !same(right, common) &&
            !same(left, right)
          ) {
            const selected = atom(common, left, right, [...path, '$order']);
            preferred = selected.map((id) => ({ id }));
          }
          const ordering = [
            ...new Set([...preferred, ...l, ...r].map((item) => item.id)),
          ];
          return ordering
            .filter((id) => items.has(id))
            .map((id) => items.get(id));
        }
        if (
          ['projectIds', 'days', 'prayers'].includes(path.at(-1)) &&
          [previous, l, r].every((list) =>
            list.every(
              (item) => typeof item === 'string' || typeof item === 'number',
            ),
          )
        ) {
          const values = [...new Set([...l, ...r, ...previous])],
            result = [];
          for (const value of values) {
            const keep = atom(
              previous.includes(value),
              l.includes(value),
              r.includes(value),
              [...path, { value }],
            );
            if (keep) result.push(value);
          }
          return result;
        }
        // Fixed-position settings can change independently on two devices.
        if (
          known &&
          ['offsets', 'times'].includes(path.at(-1)) &&
          previous.length === l.length &&
          l.length === r.length
        )
          return l.map((value, i) =>
            visit(previous[i], value, r[i], [...path, i]),
          );
        return clash(b, l, r, path);
      }
      if (object(l) && object(r) && (object(b) || b === absent || !known)) {
        const result = {},
          skip = new Set();
        for (const [kind, fields] of slotGroups) {
          if (
            !fields.some((field) =>
              [b, l, r].some((value) => object(read(value, field))),
            )
          )
            continue;
          fields.forEach((field) => skip.add(field));
          const keys = [
            ...new Set(
              [b, l, r].flatMap((value) =>
                fields.flatMap((field) =>
                  Object.keys(
                    read(value, field) === absent ? {} : read(value, field),
                  ),
                ),
              ),
            ),
          ];
          fields.forEach((field) => {
            if ([b, l, r].some((value) => read(value, field) !== absent))
              put(result, field, {});
          });
          for (const key of keys) {
            const bundles = [b, l, r].map((value) => {
              const bundle = {};
              fields.forEach((field) =>
                put(bundle, field, read(read(value, field), key)),
              );
              return Object.keys(bundle).length ? bundle : absent;
            });
            const bundle = atom(...bundles, [...path, kind, key]);
            if (bundle !== absent)
              fields.forEach((field) => {
                if (own(bundle, field)) {
                  result[field] ??= {};
                  put(result[field], key, bundle[field]);
                }
              });
          }
        }
        const memberships =
          Array.isArray(l.projectIds) && Array.isArray(r.projectIds);
        if (memberships) skip.add('projectId');
        for (const key of new Set(
          [b, l, r].flatMap((value) =>
            object(value) ? Object.keys(value) : [],
          ),
        ))
          if (!skip.has(key))
            put(
              result,
              key,
              visit(read(b, key), read(l, key), read(r, key), [...path, key]),
            );
        if (memberships) result.projectId = result.projectIds[0] || '';
        return result;
      }
      return clash(b, l, r, path);
    }
    return {
      state: visit(known ? base : absent, local, remote, []),
      conflicts,
    };
  }
  // A reverse patch stores the acknowledged base beside an offline queue without
  // duplicating every task/day in localStorage. Old cache records remain readable.
  function diff(source, target, path = [], ops = []) {
    if (same(source, target)) return ops;
    if (Array.isArray(source) && Array.isArray(target)) {
      target.forEach((value, i) =>
        diff(i < source.length ? source[i] : absent, value, [...path, i], ops),
      );
      if (source.length > target.length)
        ops.push({ path: [...path, 'length'], value: target.length });
    } else if (object(source) && object(target)) {
      for (const key of new Set([
        ...Object.keys(source),
        ...Object.keys(target),
      ]))
        diff(read(source, key), read(target, key), [...path, key], ops);
    } else
      ops.push(
        target === absent
          ? { path, remove: true }
          : { path, value: copy(target) },
      );
    return ops;
  }
  function patch(source, ops) {
    let result = copy(source);
    for (const op of ops) {
      if (!op.path.length) {
        result = copy(op.value);
        continue;
      }
      let parent = result;
      for (const key of op.path.slice(0, -1)) {
        if (parent == null || !own(parent, key))
          throw Error('Invalid sync base');
        parent = parent[key];
      }
      const key = op.path.at(-1);
      if (op.remove) delete parent[key];
      else if (Array.isArray(parent) && key === 'length')
        parent.length = op.value;
      else put(parent, key, copy(op.value));
    }
    return result;
  }
  return { same, merge, diff, patch };
})();
if (typeof module !== 'undefined') module.exports = WaqtiSyncMerge;
