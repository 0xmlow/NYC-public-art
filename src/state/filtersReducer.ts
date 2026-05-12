/**
 * Filters reducer — single source of truth for the UI filter state.
 * Used via React's useReducer in App.tsx; consumed by both the
 * sidebar (chip rows) and the map (`updateMapFilter`).
 */

import type { Borough, EraBucket, TypeFilter } from '../types';

export interface FiltersState {
  borough: Borough;
  type: TypeFilter;
  era: EraBucket;
  query: string;
}

export const initialFilters: FiltersState = {
  borough: 'All',
  type: 'All',
  era: 'All',
  query: '',
};

export type FiltersAction =
  | { type: 'setBorough'; value: Borough }
  | { type: 'setType'; value: TypeFilter }
  | { type: 'setEra'; value: EraBucket }
  | { type: 'setQuery'; value: string }
  | { type: 'reset' }
  | { type: 'resetFiltersOnly' };  // keep query, reset chip filters

export function filtersReducer(state: FiltersState, action: FiltersAction): FiltersState {
  switch (action.type) {
    case 'setBorough': return { ...state, borough: action.value };
    case 'setType':    return { ...state, type: action.value };
    case 'setEra':     return { ...state, era: action.value };
    case 'setQuery':   return { ...state, query: action.value };
    case 'reset':      return initialFilters;
    case 'resetFiltersOnly':
      return { ...state, borough: 'All', type: 'All', era: 'All' };
    default:           return state;
  }
}

/** True when ANY chip filter is non-default. (Search query excluded.) */
export function hasActiveFilters(s: FiltersState): boolean {
  return s.borough !== 'All' || s.type !== 'All' || s.era !== 'All';
}
