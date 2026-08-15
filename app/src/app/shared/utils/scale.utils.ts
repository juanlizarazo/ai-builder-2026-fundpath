import { scaleLinear, scaleTime } from 'd3-scale';
import { timeMonth } from 'd3-time';

/**
 * Shared d3 wrappers. No component should import d3-scale/d3-time/
 * d3-time-format directly — add new helpers here instead.
 */

/** Tick dates (one per month) spanning `from`..`to`, inclusive. */
export function monthTicks(from: Date, to: Date): Date[] {
  return scaleTime().domain([from, to]).ticks(timeMonth);
}

/** Proportional position of `date` within [from, to], clamped to [0, 1]. */
export function datePosition(date: Date, from: Date, to: Date): number {
  return scaleTime().domain([from, to]).range([0, 1]).clamp(true)(date);
}

/** Proportional position of `value` within [min, max], clamped to [0, 1]. */
export function linearPosition(value: number, min: number, max: number): number {
  return scaleLinear().domain([min, max]).range([0, 1]).clamp(true)(value);
}
