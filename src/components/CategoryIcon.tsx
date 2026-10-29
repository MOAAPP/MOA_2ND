import { IconTile, TONE, type GlyphName, type Tone } from './Glyph';

const MAP: Record<string, { g: GlyphName; tone: Tone }> = {
  식비: { g: 'bowl', tone: 'orange' },
  카페: { g: 'cup', tone: 'brown' },
  쇼핑: { g: 'bag', tone: 'pink' },
  패션: { g: 'shirt', tone: 'violet' },
  교통: { g: 'bus', tone: 'blue' },
  '문화·여가': { g: 'ticket', tone: 'red' },
  구독: { g: 'play', tone: 'slate' },
  생활: { g: 'home', tone: 'teal' },
  경조사: { g: 'gift', tone: 'amber' },
  기타: { g: 'dots', tone: 'slate' },
};

export function categoryColor(c: string) {
  return TONE[(MAP[c] ?? MAP['기타']).tone][1];
}

export function CategoryIcon({ category, size = 42 }: { category: string; size?: number }) {
  const m = MAP[category] ?? MAP['기타'];
  return <IconTile name={m.g} tone={m.tone} size={size} />;
}
