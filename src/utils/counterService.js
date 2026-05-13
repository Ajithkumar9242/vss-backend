/**
 * counterService.js
 * Provides atomic, race-condition-safe sequence generation for
 * admission numbers, roll numbers, etc.
 *
 * Format example: 001/2026-27
 */

const Counter = require('../models/Counter');
const AppError = require('./AppError');

class CounterService {
  /**
   * Get the next sequence number for a given counter name.
   * Atomically increments the counter in MongoDB (no race conditions).
   *
   * @param {string} name          - counter identifier e.g. 'admissionNumber', 'rollNumber'
   * @param {Object} [options]
   * @param {number}  [options.padLength=3]     - zero-padding length
   * @param {string}  [options.yearLabel]        - e.g. '2026-27' appended as suffix
   * @param {number}  [options.startFrom=1]      - start sequence from this value (first time)
   * @returns {Promise<{ formatted: string, sequence: number }>}
   */
  static async getNext(name, options = {}) {
    const { padLength = 3, yearLabel = '', startFrom = 1 } = options;

    if (!name || typeof name !== 'string') {
      throw new AppError('Counter name is required', 400);
    }

    // Atomic increment — upsert creates counter if it doesn't exist
    const counter = await Counter.findOneAndUpdate(
      { name },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // If this is the very first increment and we want to start from a custom value
    // adjust by setting sequence to startFrom if the counter was just created
    let seq = counter.sequence;
    if (seq < startFrom) {
      // Recover: set to startFrom
      const fixed = await Counter.findOneAndUpdate(
        { name, sequence: { $lt: startFrom } },
        { $set: { sequence: startFrom } },
        { new: true }
      );
      if (fixed) seq = fixed.sequence;
    }

    const padded = String(seq).padStart(padLength, '0');
    const formatted = yearLabel ? `${padded}/${yearLabel}` : padded;

    return { formatted, sequence: seq };
  }

  /**
   * Preview the next number without consuming the sequence.
   * NOTE: this is NOT atomic — the actual generated number may differ under load.
   */
  static async preview(name, options = {}) {
    const { padLength = 3, yearLabel = '' } = options;
    const counter = await Counter.findOne({ name }).lean();
    const nextSeq = (counter?.sequence || 0) + 1;
    const padded = String(nextSeq).padStart(padLength, '0');
    const formatted = yearLabel ? `${padded}/${yearLabel}` : padded;
    return { formatted, sequence: nextSeq, preview: true };
  }

  /**
   * Derive academic year label from a date (e.g. 2026-27).
   * If month >= April, year is current/next; otherwise previous/current.
   */
  static getAcademicYearLabel(date = new Date()) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = d.getMonth() + 1; // 1-based
    if (month >= 4) {
      return `${year}-${String(year + 1).slice(-2)}`;
    }
    return `${year - 1}-${String(year).slice(-2)}`;
  }

  /**
   * Reset a counter to a specific value (admin use only).
   * Use with extreme caution — can cause duplicate numbers if records already exist.
   */
  static async reset(name, toValue = 0) {
    await Counter.findOneAndUpdate(
      { name },
      { $set: { sequence: toValue } },
      { upsert: true }
    );
    return { name, reset: true, newValue: toValue };
  }
}

module.exports = CounterService;
