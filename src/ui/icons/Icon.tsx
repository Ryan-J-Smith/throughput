import { GLYPHS } from './glyphs';
import type { Glyph, IconName } from './glyphs';
import './icons.css';

export type IconSize = 'sm' | 'md' | 'lg' | 'xl';

export type IconProps = {
  name: IconName;
  /** Token size from theme/tokens.css (--icon-sm … --icon-xl); defaults to the surrounding text size. */
  size?: IconSize;
  /** Accessible name. Without one the icon is decorative and hidden from screen readers. */
  label?: string;
  className?: string;
};

/** An inline SVG glyph painted in currentColor, so it takes the colour of the text around it. */
export function Icon({ name, size, label, className }: IconProps) {
  const classes = ['icon', size !== undefined && `icon--${size}`, className].filter(Boolean).join(' ');
  const glyph: Glyph = GLYPHS[name];
  return (
    <svg
      className={classes}
      viewBox="0 0 24 24"
      focusable="false"
      {...(label !== undefined ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {glyph.map((part, i) =>
        part.paint === 'stroke' ? (
          <path key={i} d={part.d} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path key={i} d={part.d} fill="currentColor" fillRule={part.paint === 'evenodd' ? 'evenodd' : undefined} />
        ),
      )}
    </svg>
  );
}
