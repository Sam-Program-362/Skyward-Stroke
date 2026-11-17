import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PLAY_SETTINGS,
  applyPlaySettingsToLine,
  formatTrackLines,
  getPlayerRank,
  serializeBackupData,
  parseBackupData,
  resolveVirtualKeyboardState,
  extractNativeInputChars,
  type PlaySettings,
} from './gameLogic';
import { defaultStats } from '../data';

test('applyPlaySettingsToLine preserves pure lowercase when all modifiers are off', () => {
  const line = 'soft clouds drift over the quiet garden';
  const result = applyPlaySettingsToLine(line, DEFAULT_PLAY_SETTINGS, 0);
  assert.equal(result, line);
  assert.equal(/^[a-z ]+$/.test(result), true);
});

test('applyPlaySettingsToLine capitalizes first word and poetic nouns when uppercase is enabled', () => {
  const settings: PlaySettings = {
    ...DEFAULT_PLAY_SETTINGS,
    uppercase: true,
  };
  const result = applyPlaySettingsToLine('soft clouds drift over the quiet garden', settings, 0);
  assert.equal(result.startsWith('Soft'), true);
  assert.equal(result.includes('Garden'), true);
});

test('applyPlaySettingsToLine injects allowed punctuation (, . \' & - ? !) when punctuation is enabled', () => {
  const settings: PlaySettings = {
    ...DEFAULT_PLAY_SETTINGS,
    uppercase: true,
    punctuation: true,
    enabledPunctuation: [',', '.', "'", '&', '-', '?', '!'],
  };
  const lines = [
    'take a breath and find your rhythm today',
    'step by step the path grows beneath you',
    'it is a quiet morning in the sky garden',
    'slow hands and calm minds make smooth music',
  ];
  const combined = formatTrackLines(lines, settings);
  assert.equal(combined.includes('&'), true);
  assert.equal(combined.toLowerCase().includes('step-by-step'), true);
  assert.equal(combined.includes("'"), true);
  assert.equal(combined.includes(','), true);
  assert.equal(/[.!?]$/.test(combined), true);
});

test('applyPlaySettingsToLine respects filtered enabledPunctuation subset', () => {
  const settings: PlaySettings = {
    ...DEFAULT_PLAY_SETTINGS,
    punctuation: true,
    enabledPunctuation: ['?'],
  };
  const result = applyPlaySettingsToLine('take a breath and find your rhythm', settings, 0);
  assert.equal(result.endsWith('?'), true);
  assert.equal(result.includes(','), false);
  assert.equal(result.includes('&'), false);
});

test('applyPlaySettingsToLine injects numbers when numbers setting is enabled', () => {
  const settings: PlaySettings = {
    ...DEFAULT_PLAY_SETTINGS,
    numbers: true,
  };
  const result = applyPlaySettingsToLine('every word you type becomes a bridge', settings, 1);
  assert.equal(/\d+/.test(result), true);
});

test('serializeBackupData and parseBackupData roundtrip full player stats and settings', () => {
  const base = defaultStats();
  base.bestWpm = 94;
  base.bestAcc = 99;
  base.highestCombo = 128;
  base.totalWords = 1420;
  base.tracks = 14;
  base.unlocked = 6;
  base.look = { outfit: 'purple', hat: 'crown', trail: 'rainbow' };
  base.settings.uppercase = true;
  base.settings.punctuation = true;
  base.settings.deviceMode = 'mobile-native';
  base.settings.deviceSelected = true;
  base.ghosts['sky'] = { times: [120, 240, 360], wpm: 94, text: 'Soft clouds' };

  const json = serializeBackupData(base);
  const parsed = parseBackupData(json, defaultStats());
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.stats.bestWpm, 94);
    assert.equal(parsed.stats.bestAcc, 99);
    assert.equal(parsed.stats.highestCombo, 128);
    assert.equal(parsed.stats.unlocked, 6);
    assert.equal(parsed.stats.look.hat, 'crown');
    assert.equal(parsed.stats.settings.uppercase, true);
    assert.equal(parsed.stats.settings.punctuation, true);
    assert.equal(parsed.stats.settings.deviceMode, 'mobile-native');
    assert.equal(parsed.stats.settings.deviceSelected, true);
    assert.equal(parsed.stats.ghosts['sky']?.wpm, 94);
  }
});

test('parseBackupData rejects malformed JSON and non-stats objects safely', () => {
  const badSyntax = parseBackupData('{broken json', defaultStats());
  assert.equal(badSyntax.ok, false);

  const wrongObject = parseBackupData('{"hello": "world"}', defaultStats());
  assert.equal(wrongObject.ok, false);
});

test('getPlayerRank scales rank titles with level and WPM', () => {
  const novice = getPlayerRank(0, 0);
  assert.equal(novice.title, 'Skyward Novice');

  const master = getPlayerRank(26, 110);
  assert.equal(master.title, 'Celestial Architect');
});

test('resolveVirtualKeyboardState handles uppercase auto-shift, manual shift, and punctuation targets', () => {
  const autoUpper = resolveVirtualKeyboardState('S', 'off', true);
  assert.equal(autoUpper.isShifted, true);
  assert.equal(autoUpper.targetKey, 'S');
  assert.equal(autoUpper.needsShiftTap, false);

  const manualNeeded = resolveVirtualKeyboardState('S', 'off', false);
  assert.equal(manualNeeded.isShifted, false);
  assert.equal(manualNeeded.needsShiftTap, true);
  assert.equal(manualNeeded.targetKey, 's');

  const punct = resolveVirtualKeyboardState('&', 'off', true);
  assert.equal(punct.isShifted, false);
  assert.equal(punct.targetKey, '&');

  const digit = resolveVirtualKeyboardState('7', 'off', true);
  assert.equal(digit.needsNumberLayer, true);
  assert.equal(digit.targetKey, '7');
});

test('extractNativeInputChars extracts single and multi-char mobile OS keyboard input cleanly', () => {
  assert.deepEqual(extractNativeInputChars('\u200BS'), ['S']);
  assert.deepEqual(extractNativeInputChars('\u200B, '), [',', ' ']);
  assert.deepEqual(extractNativeInputChars('!'), ['!']);
  assert.deepEqual(extractNativeInputChars('\u200B'), []);
});
