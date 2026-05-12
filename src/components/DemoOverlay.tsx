/**
 * Visual surface for demo mode — a large narrating caption and a
 * top-right "press ESC to exit" badge. Both purely cosmetic; the
 * orchestration lives in useDemo.
 */

import type { Caption } from '../hooks/useDemo';

interface Props {
  caption: Caption | null;
  running: boolean;
}

export function DemoOverlay({ caption, running }: Props) {
  return (
    <>
      <div className={`demo-caption ${caption ? 'visible' : ''}`}>
        {caption && (
          <>
            {caption.title}
            {caption.sub && <span className="sub">{caption.sub}</span>}
          </>
        )}
      </div>
      <div className={`demo-badge ${running ? 'visible' : ''}`}>
        ● AUTO-TOUR · press ESC to exit
      </div>
    </>
  );
}
