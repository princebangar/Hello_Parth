/**
 * Sidebar sections of the Global admin. A global sub-admin gets a { view, create, edit, delete } row per
 * section, exactly like the Food sub-admin matrix. Managing sub-admins is platform-superadmin only and
 * therefore has no permission key.
 */
export const GLOBAL_PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete'];

export const GLOBAL_PERMISSION_SECTIONS = [
  { key: 'overview', label: 'Overview', path: '/admin/global' },
  { key: 'customers', label: 'Customers', path: '/admin/global/customers' },
  { key: 'landing', label: 'Landing Page', path: '/admin/global/landing' },
  { key: 'pagesSocialMedia', label: 'Pages & Social Media', path: '/admin/global/pages-social-media' },
  { key: 'customization', label: 'Customization Settings', path: '/admin/global/customization' },
];

export const GLOBAL_SECTION_KEYS = GLOBAL_PERMISSION_SECTIONS.map((section) => section.key);

const toRow = (raw = {}) => ({
  view: Boolean(raw?.view),
  create: Boolean(raw?.create),
  edit: Boolean(raw?.edit),
  delete: Boolean(raw?.delete),
});

/** Keeps only known sections; writing implies viewing. */
export const normalizeGlobalPermissions = (input = {}) => {
  const result = {};
  GLOBAL_SECTION_KEYS.forEach((key) => {
    const row = toRow(input?.[key]);
    if (row.create || row.edit || row.delete) row.view = true;
    result[key] = row;
  });
  return result;
};

export const hasGlobalAction = (permissions = {}, sectionKey, action = 'view') => {
  const row = permissions?.[sectionKey];
  if (!row) return false;
  if (action === 'view') return Boolean(row.view || row.create || row.edit || row.delete);
  return Boolean(row[action]);
};

export const hasAnyGlobalPermission = (permissions = {}) =>
  GLOBAL_SECTION_KEYS.some((key) => hasGlobalAction(permissions, key, 'view'));
