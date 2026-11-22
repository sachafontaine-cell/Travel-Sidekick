// Names and map colours of the 8 groups (plus Other), shared by the list, Decide and the map.
import type { Group } from './groups'

export const GROUP_LIST: [Group, string, string][] = [
  ['sight', 'Sights', '#C2410C'], ['museum', 'Museums', '#7C3AED'], ['outdoors', 'Outdoors', '#15803D'], ['tour', 'Tours', '#0E7490'],
  ['kids', 'Kids', '#DB2777'], ['show', 'Shows', '#B45309'], ['food', 'Food', '#DC2626'], ['shop', 'Shopping', '#2563EB'], ['other', 'Other', '#6B7280'],
]
export const GROUP_COLOR = Object.fromEntries(GROUP_LIST.map(([g, , c]) => [g, c])) as Record<Group, string>
export const GROUP_NAME = Object.fromEntries(GROUP_LIST.map(([g, n]) => [g, n])) as Record<Group, string>
