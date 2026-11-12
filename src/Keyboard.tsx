import type { CSSProperties, PointerEvent } from 'react';

/** Sizes in CSS pixels. Keys shrink below keyMaxW when ten of them would not fit across. */
export interface KeyMetrics { keyH: number; keyMaxW: number; gap: number; padTop: number }

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

/**
 * On-screen keyboard for touch screens. Keys fire on touch-down for the lowest latency, and
 * each key's touch area reaches out to its neighbours (and to the screen edge on the shorter
 * rows), so a tap that lands between two keycaps still counts. The key in the bottom-right
 * corner puts the keyboard away; it needs a full tap, so brushing it does nothing.
 */
export default function Keyboard({ onKey, onHide, metrics }: { onKey: (key: string) => void; onHide: () => void; metrics: KeyMetrics }) {
  const press = (e: PointerEvent<HTMLButtonElement>, k: string) => {
    e.preventDefault();
    e.currentTarget.setAttribute('data-down', '');
    onKey(k);
  };
  const release = (e: PointerEvent<HTMLButtonElement>) => e.currentTarget.removeAttribute('data-down');
  const key = (k: string, extra = '') => (
    <button key={k} type="button" tabIndex={-1} data-key={k === ' ' ? 'space' : k} className={`kb-key ${extra}`}
      onPointerDown={e => press(e, k)} onPointerUp={release} onPointerCancel={release} onPointerLeave={release}>
      <span className="kb-cap">{k === ' ' ? 'space' : k}</span>
    </button>
  );
  const vars = { '--kh': `${metrics.keyH}px`, '--kw': `${metrics.keyMaxW}px`, '--kg': `${metrics.gap}px`, paddingTop: metrics.padTop } as CSSProperties;
  return (
    <div className="kb" style={vars} onContextMenu={e => e.preventDefault()}>
      {ROWS.map(row => <div key={row} className={`kb-row kb-row-${row.length}`}>{row.split('').map(k => key(k))}</div>)}
      <div className="kb-row">
        {key(' ', 'kb-space')}
        <button type="button" tabIndex={-1} data-key="hide" className="kb-key kb-hide" aria-label="Hide the on-screen keyboard" title="Hide the on-screen keyboard" onClick={onHide}>
          <span className="kb-cap">⌨</span>
        </button>
      </div>
    </div>
  );
}
