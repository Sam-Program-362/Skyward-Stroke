import { useState, type CSSProperties, type PointerEvent } from 'react';
import {
  PUNCTUATION_CHARS,
  resolveVirtualKeyboardState,
  type PlaySettings,
  type ShiftMode,
} from './utils/gameLogic';

/** Sizes in CSS pixels. Keys shrink below keyMaxW when ten of them would not fit across. */
export interface KeyMetrics {
  keyH: number;
  keyMaxW: number;
  gap: number;
  padTop: number;
}

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const NUM_ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export default function Keyboard({
  onKey,
  onHide,
  onSwitchToNative,
  metrics,
  settings,
  expectedChar,
}: {
  onKey: (key: string) => void;
  onHide: () => void;
  onSwitchToNative?: () => void;
  metrics: KeyMetrics;
  settings?: PlaySettings;
  expectedChar?: string;
}) {
  const [shiftMode, setShiftMode] = useState<ShiftMode>('off');
  const [showNums, setShowNums] = useState(false);
  const [autoShift, setAutoShift] = useState(settings?.autoShiftVirtual ?? true);

  const kbState = resolveVirtualKeyboardState(expectedChar, shiftMode, autoShift);
  const { isShifted, needsShiftTap, needsNumberLayer, targetKey } = kbState;

  const cycleShift = () => {
    setShiftMode(prev => (prev === 'off' ? 'once' : prev === 'once' ? 'caps' : 'off'));
  };

  const press = (e: PointerEvent<HTMLButtonElement>, k: string) => {
    e.preventDefault();
    e.currentTarget.setAttribute('data-down', '');
    const isLetter = /^[a-z]$/i.test(k);
    const out = isLetter ? (isShifted ? k.toUpperCase() : k.toLowerCase()) : k;
    onKey(out);
    if (shiftMode === 'once' && isLetter) {
      setShiftMode('off');
    }
  };

  const release = (e: PointerEvent<HTMLButtonElement>) =>
    e.currentTarget.removeAttribute('data-down');

  const key = (k: string, extra = '') => {
    const isLetter = /^[a-z]$/i.test(k);
    const label = k === ' ' ? 'space' : isLetter ? (isShifted ? k.toUpperCase() : k.toLowerCase()) : k;
    const keyId = k === ' ' ? 'space' : label;
    const isTarget = targetKey === keyId;

    return (
      <button
        key={k}
        type="button"
        tabIndex={-1}
        data-key={keyId}
        data-target={isTarget ? 'true' : undefined}
        aria-label={k === ' ' ? 'Space' : `Key ${label}`}
        className={`kb-key ${extra}`}
        onPointerDown={e => press(e, k)}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
      >
        <span className="kb-cap">{label}</span>
      </button>
    );
  };

  const displayNumbers = showNums || Boolean(settings?.numbers) || needsNumberLayer;

  const vars = {
    '--kh': `${metrics.keyH}px`,
    '--kw': `${metrics.keyMaxW}px`,
    '--kg': `${metrics.gap}px`,
    paddingTop: metrics.padTop,
  } as CSSProperties;

  return (
    <div
      className="kb"
      data-testid="virtual-keyboard"
      style={vars}
      onContextMenu={e => e.preventDefault()}
    >
      <div className="kb-row kb-row-punct">
        <button
          type="button"
          tabIndex={-1}
          data-key="123-toggle"
          data-target={needsNumberLayer && !displayNumbers ? 'true' : undefined}
          aria-label="Toggle numbers row"
          aria-pressed={displayNumbers}
          onClick={() => setShowNums(v => !v)}
          className="kb-key kb-fn"
        >
          <span className={`kb-cap ${displayNumbers ? 'kb-cap-active' : ''}`}>123</span>
        </button>

        {PUNCTUATION_CHARS.map(ch => key(ch, 'kb-punct'))}

        <button
          type="button"
          tabIndex={-1}
          data-key="autoshift-toggle"
          aria-label="Toggle Auto-Shift for uppercase letters"
          aria-pressed={autoShift}
          title="Auto-Shift automatically capitalizes keys when the next letter is uppercase"
          onClick={() => setAutoShift(v => !v)}
          className="kb-key kb-fn"
        >
          <span className={`kb-cap ${autoShift ? 'kb-cap-active' : ''}`}>
            {autoShift ? 'Auto⇧' : 'Man⇧'}
          </span>
        </button>

        {onSwitchToNative && (
          <button
            type="button"
            tabIndex={-1}
            data-key="native-kb"
            aria-label="Switch to Device Native OS Keyboard"
            title="Use your mobile device's built-in OS keyboard"
            onClick={onSwitchToNative}
            className="kb-key kb-fn"
          >
            <span className="kb-cap">📱OS</span>
          </button>
        )}
      </div>

      {displayNumbers && (
        <div className="kb-row kb-row-num">{NUM_ROW.map(d => key(d, 'kb-num'))}</div>
      )}

      {ROWS.map(row => (
        <div key={row} className={`kb-row kb-row-${row.length}`}>
          {row.split('').map(k => key(k))}
        </div>
      ))}

      <div className="kb-row kb-row-bottom">
        <button
          type="button"
          tabIndex={-1}
          data-key="shift"
          data-target={needsShiftTap ? 'true' : undefined}
          aria-label={
            shiftMode === 'caps'
              ? 'Caps Lock On (tap to turn off)'
              : isShifted
                ? 'Shift Active (Uppercase A-Z)'
                : 'Shift to Uppercase (A-Z)'
          }
          aria-pressed={isShifted}
          onClick={cycleShift}
          className="kb-key kb-shift"
        >
          <span className={`kb-cap ${isShifted ? 'kb-cap-active' : ''}`}>
            {shiftMode === 'caps' ? '⇪ CAPS' : isShifted ? '⇧ A–Z' : '⇧ a–z'}
          </span>
        </button>

        {key(' ', 'kb-space')}

        <button
          type="button"
          tabIndex={-1}
          data-key="hide"
          className="kb-key kb-hide"
          aria-label="Hide the on-screen keyboard"
          title="Hide the on-screen keyboard"
          onClick={onHide}
        >
          <span className="kb-cap">⌨✕</span>
        </button>
      </div>
    </div>
  );
}
