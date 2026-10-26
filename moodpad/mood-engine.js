/* MoodPad mood engine.
 * It only ever sees a timestamp and a category per key: never the character. */
(function (root) {
  'use strict';

  const SENSITIVITY = { low: 0.75, normal: 1.0, high: 1.3 };

  /** Every tunable threshold, in one place. Times are seconds. */
  const DEFAULT_CONFIG = {
    windowSeconds: 6.0,
    minSpeedSpan: 1.0,
    burstBreakGap: 1.0,
    hysteresis: 1.5,

    gooseLookbackKeys: 12,
    gooseMinKeys: 4,
    gooseBackspaceRatio: 0.30,
    gooseUppercaseRatio: 0.60,

    catPause: 2.5,
    catMinBurstKeys: 3,
    catMaxBurstKeys: 25,
    catMaxAverageGap: 0.22,

    mouseMinWPM: 75,
    wizardMaxWPM: 12,

    rhythmGapCap: 1.5,
    rhythmMinGaps: 3,
    robotMaxCV: 0.35,
    robotMinWPM: 25,
    owlGap: 0.7,
    owlMinCV: 0.5,
  };

  function scaled(config, sensitivity) {
    const f = SENSITIVITY[sensitivity] || 1;
    const c = Object.assign({}, config);
    c.gooseBackspaceRatio = config.gooseBackspaceRatio / f;
    c.gooseUppercaseRatio = Math.min(config.gooseUppercaseRatio / f, 0.95);
    c.catPause = config.catPause / f;
    c.catMaxAverageGap = config.catMaxAverageGap * f;
    c.mouseMinWPM = config.mouseMinWPM / f;
    c.wizardMaxWPM = config.wizardMaxWPM * f;
    c.owlGap = config.owlGap / f;
    return c;
  }

  function coefficientOfVariation(values, minCount) {
    if (values.length < minCount || values.length === 0) return null;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (!(mean > 0)) return null;
    const variance = values.reduce((a, v) => a + (v - mean) * (v - mean), 0) / values.length;
    return Math.sqrt(variance) / mean;
  }

  /**
   * @param events  [{time, category}] inside the rolling window, oldest first
   * @param priorEventTime  time of the last event that left the window, or null
   * @param now  time of the newest event
   */
  function classify(events, priorEventTime, now, config) {
    if (events.length === 0) return { mood: 'robot', reason: 'Waiting for you to type' };

    // 1. Angry goose
    const recent = events.slice(-config.gooseLookbackKeys);
    if (recent.length >= config.gooseMinKeys) {
      const n = recent.length;
      const backspaces = recent.filter(e => e.category === 'backspace').length / n;
      const uppercase = recent.filter(e => e.category === 'letterUppercase').length / n;
      if (backspaces > config.gooseBackspaceRatio) return { mood: 'goose', reason: 'Lots of backspacing' };
      if (uppercase > config.gooseUppercaseRatio) return { mood: 'goose', reason: 'Lots of capital letters' };
    }

    // 2. Distracted cat
    let burstStart = events.length - 1;
    while (burstStart > 0 && events[burstStart].time - events[burstStart - 1].time <= config.burstBreakGap) {
      burstStart -= 1;
    }
    const burstCount = events.length - burstStart;
    if (burstCount >= config.catMinBurstKeys && burstCount <= config.catMaxBurstKeys) {
      let pause;
      if (burstStart > 0) pause = events[burstStart].time - events[burstStart - 1].time;
      else if (priorEventTime !== null) pause = events[0].time - priorEventTime;
      else pause = Infinity;
      const averageGap = (events[events.length - 1].time - events[burstStart].time) / (burstCount - 1);
      if (pause > config.catPause && averageGap < config.catMaxAverageGap) {
        return { mood: 'cat', reason: 'A quick burst after a pause' };
      }
    }

    // 3 & 4. Speed
    const span = Math.min(Math.max(now - events[0].time, config.minSpeedSpan), config.windowSeconds);
    const wpm = events.length / span * 12;
    if (wpm > config.mouseMinWPM) return { mood: 'mouse', reason: 'Typing very fast' };
    if (wpm < config.wizardMaxWPM) return { mood: 'wizard', reason: 'Typing slowly' };

    // 5 & 6. Rhythm
    const gaps = [];
    for (let i = 1; i < events.length; i++) gaps.push(events[i].time - events[i - 1].time);
    const cv = coefficientOfVariation(gaps.filter(g => g < config.rhythmGapCap), config.rhythmMinGaps);
    if (cv !== null && cv < config.robotMaxCV && wpm >= config.robotMinWPM) {
      return { mood: 'robot', reason: 'Steady rhythm' };
    }
    if (gaps.some(g => g > config.owlGap)) return { mood: 'owl', reason: 'Pausing to think' };
    if (cv !== null && cv >= config.owlMinCV) return { mood: 'owl', reason: 'Uneven rhythm' };

    // 7. Fallback
    return { mood: 'robot', reason: 'Settling into a groove' };
  }

  /** Feeds key events through the classifier and applies hysteresis. */
  class MoodEngine {
    constructor(config) {
      this.config = config || DEFAULT_CONFIG;
      this.mood = 'robot';
      this.reason = 'Waiting for you to type';
      this._events = [];
      this._prior = null;
      this._last = null;
      this._candidate = null;
      this._candidateSince = 0;
    }

    record(category, time) {
      const isBurstStart = this._last === null || time - this._last > this.config.burstBreakGap;
      this._last = time;

      this._events.push({ time, category });
      const cutoff = time - this.config.windowSeconds;
      while (this._events.length && this._events[0].time <= cutoff) {
        this._prior = this._events.shift().time;
      }

      const result = classify(this._events, this._prior, time, this.config);

      let didSwitch = false;
      if (result.mood === this.mood) {
        this._candidate = null;
        this.reason = result.reason;
      } else if (result.mood === 'goose') {
        didSwitch = true;
      } else if (this._candidate === result.mood) {
        didSwitch = time - this._candidateSince >= this.config.hysteresis;
      } else {
        this._candidate = result.mood;
        this._candidateSince = time;
      }

      if (didSwitch) {
        this.mood = result.mood;
        this.reason = result.reason;
        this._candidate = null;
      }
      return { mood: this.mood, reason: this.reason, didSwitch, isBurstStart };
    }

    /** Current typing speed in wpm (keys per second * 12) over the rolling window, backspaces excluded. */
    currentWPM(now) {
      const cutoff = now - this.config.windowSeconds;
      const recent = this._events.filter(e => e.time > cutoff);
      if (recent.length === 0) return 0;
      const span = Math.min(Math.max(now - recent[0].time, this.config.minSpeedSpan), this.config.windowSeconds);
      return recent.filter(e => e.category !== 'backspace').length / span * 12;
    }
  }

  const api = { DEFAULT_CONFIG, SENSITIVITY, scaled, classify, MoodEngine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MoodCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
