const ALL_ACTIONS = ["view", "create", "edit", "delete"]

export const emptyRow = () => ({ view: false, create: false, edit: false, delete: false })

/** One row per sidebar option; missing rows read as "no access". */
export const normalizeMatrix = (value = {}, rows = []) => {
  const next = {}
  rows.forEach((row) => {
    const raw = value?.[row.key] || {}
    next[row.key] = {
      view: Boolean(raw.view),
      create: Boolean(raw.create),
      edit: Boolean(raw.edit),
      delete: Boolean(raw.delete),
    }
  })
  return next
}

export const matrixHasAccess = (value = {}) =>
  Object.values(value).some((row) => ALL_ACTIONS.some((action) => row?.[action]))

/**
 * View / create / edit / delete grid for a list of sidebar options — the same behaviour as the Food sub-admin
 * matrix: unticking View clears the row, ticking create / edit / delete also ticks View.
 * A row can offer fewer actions through `row.actions` (for example Overview is view-only).
 */
export default function PermissionMatrix({ rows, value, onChange, disabled = false, firstColumnLabel = "Sidebar section" }) {
  const rowActions = (row) => (Array.isArray(row.actions) && row.actions.length > 0 ? row.actions : ALL_ACTIONS)
  const current = (key) => value?.[key] || emptyRow()

  const toggleAction = (row, action, checked) => {
    const existing = { ...current(row.key) }
    let next
    if (action === "view" && !checked) {
      next = emptyRow()
    } else {
      next = { ...existing, [action]: checked }
      if (checked && action !== "view") next.view = true
    }
    onChange({ ...value, [row.key]: next })
  }

  const toggleRow = (row, checked) => {
    const next = emptyRow()
    rowActions(row).forEach((action) => {
      next[action] = checked
    })
    onChange({ ...value, [row.key]: next })
  }

  const rowAllChecked = (row) => rowActions(row).every((action) => current(row.key)[action])

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">{firstColumnLabel}</th>
            <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider w-16">All</th>
            {ALL_ACTIONS.map((action) => (
              <th key={action} className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider w-20 capitalize">
                {action}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => {
            const allowed = rowActions(row)
            return (
              <tr key={row.key} className="hover:bg-slate-50/80">
                <td className="px-4 py-3 text-sm text-slate-800">
                  {row.label}
                  {row.hint && <span className="block text-xs text-slate-400 mt-0.5">{row.hint}</span>}
                </td>
                <td className="px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={rowAllChecked(row)}
                    disabled={disabled}
                    onChange={(event) => toggleRow(row, event.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
                    aria-label={`All permissions for ${row.label}`}
                  />
                </td>
                {ALL_ACTIONS.map((action) => (
                  <td key={action} className="px-3 py-3 text-center">
                    {allowed.includes(action) ? (
                      <input
                        type="checkbox"
                        checked={Boolean(current(row.key)[action])}
                        disabled={disabled}
                        onChange={(event) => toggleAction(row, action, event.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
                        aria-label={`${action} for ${row.label}`}
                      />
                    ) : (
                      <span className="text-slate-300" aria-hidden="true">—</span>
                    )}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
