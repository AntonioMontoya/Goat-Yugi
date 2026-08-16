export function createActionRegistry() {
  return new Map();
}

export function registerAction(registry, action) {
  const baseId = String(action?.id ?? "ui-action");
  let id = baseId;
  let suffix = 2;
  while (registry.has(id)) id = `${baseId}-${suffix++}`;
  registry.set(id, action);
  return id;
}
