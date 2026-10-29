import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import type { CardSpec } from './cardContent';
import type { PhotoMeta } from './types';

const require = createRequire(import.meta.url);
const fontDir = join(dirname(require.resolve('pretendard/package.json')), 'dist/public/static/alternative');
const fonts = [
  { name: 'Pretendard', data: readFileSync(join(fontDir, 'Pretendard-Regular.ttf')), weight: 400 as const, style: 'normal' as const },
  { name: 'Pretendard', data: readFileSync(join(fontDir, 'Pretendard-SemiBold.ttf')), weight: 600 as const, style: 'normal' as const },
  { name: 'Pretendard', data: readFileSync(join(fontDir, 'Pretendard-Bold.ttf')), weight: 700 as const, style: 'normal' as const },
];

export const CARD_W = 1080;
export const CARD_H = 1350;

type Node = { type: string; props: Record<string, unknown> };
type Child = Node | string | null | false | undefined;

function h(type: string, style: Record<string, unknown>, ...children: Child[]): Node {
  const kids = children.filter((c): c is Node | string => !!c);
  return { type, props: { style: { display: 'flex', ...style }, children: kids.length === 1 ? kids[0] : kids } };
}

const C = {
  ink: '#151A22',
  sub: '#5B6573',
  faint: '#8A94A3',
  line: '#E6E9EE',
  blue: '#2563EB',
  up: '#D9363E',
  down: '#2563EB',
  panel: '#FFFFFF',
};

function statColor(t?: string) {
  return t === 'up' ? C.up : t === 'down' ? C.down : C.ink;
}

export interface RenderPhoto {
  meta: PhotoMeta;
  dataUri: string | null;
}

export function cardTree(card: CardSpec, photo: RenderPhoto): Node {
  const photoBox = h(
    'div',
    { position: 'relative', flexGrow: 1, minHeight: 440, width: '100%', backgroundColor: '#1D2633', flexDirection: 'column', justifyContent: 'space-between' },
    photo.dataUri
      ? { type: 'img', props: { src: photo.dataUri, width: CARD_W, height: 900, style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' } } }
      : null,
    // 가독성을 위한 그라데이션
    h('div', { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundImage: 'linear-gradient(180deg, rgba(10,14,20,0.55) 0%, rgba(10,14,20,0.05) 30%, rgba(10,14,20,0.35) 55%, rgba(10,14,20,0.88) 100%)' }),
    h(
      'div',
      { position: 'relative', justifyContent: 'space-between', alignItems: 'center', padding: '44px 56px 0' },
      h('div', { fontSize: 28, fontWeight: 700, color: '#FFFFFF', letterSpacing: -0.5 }, '평행통장'),
      h('div', { fontSize: 26, fontWeight: 600, color: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.18)', padding: '8px 20px', borderRadius: 999 }, `${card.index} / 4`),
    ),
    h(
      'div',
      { position: 'relative', flexDirection: 'column', padding: '0 56px 36px' },
      h('div', { fontSize: 28, fontWeight: 600, color: 'rgba(255,255,255,0.86)', marginBottom: 14 }, card.eyebrow),
      ...card.title.split('\n').map((line) => h('div', { fontSize: 66, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.2, letterSpacing: -1.5 }, line)),
      h(
        'div',
        { fontSize: 21, color: 'rgba(255,255,255,0.72)', marginTop: 18 },
        photo.dataUri && photo.meta.photographer ? `자료 사진 · Photo: ${photo.meta.photographer} / ${photo.meta.provider === 'pixabay' ? 'Pixabay' : 'Pexels'} (현장 사진 아님)` : '사진 없이 생성된 카드',
      ),
    ),
  );

  const stats =
    card.stats.length > 0
      ? h(
          'div',
          { width: '100%', borderBottom: `2px solid ${C.line}`, paddingBottom: 26, marginBottom: 26 },
          ...card.stats.map((s, i) =>
            h(
              'div',
              { flexDirection: 'column', flex: 1, paddingLeft: i === 0 ? 0 : 24, borderLeft: i === 0 ? 'none' : `2px solid ${C.line}` },
              h('div', { fontSize: 25, color: C.sub, marginBottom: 8 }, s.label),
              h('div', { fontSize: card.stats.length > 2 ? 40 : 46, fontWeight: 700, color: statColor(s.tone), letterSpacing: -1 }, s.value),
              s.sub ? h('div', { fontSize: 23, color: s.tone && s.tone !== 'flat' ? statColor(s.tone) : C.faint, marginTop: 6 }, s.sub) : null,
            ),
          ),
        )
      : null;

  const sections = card.sections.map((sec) =>
    h(
      'div',
      { flexDirection: 'column', marginBottom: 20 },
      sec.heading ? h('div', { fontSize: 25, fontWeight: 700, color: C.blue, marginBottom: 8 }, sec.heading) : null,
      ...sec.lines.map((l) => h('div', { fontSize: 30, color: C.ink, lineHeight: 1.42, marginBottom: 4 }, l)),
    ),
  );

  const panel = h(
    'div',
    { flexDirection: 'column', backgroundColor: C.panel, padding: '40px 56px 30px', width: '100%' },
    stats,
    ...sections,
    h('div', { fontSize: 20, color: C.faint, marginTop: 8, lineHeight: 1.4 }, card.footer),
  );

  return h('div', { width: CARD_W, height: CARD_H, flexDirection: 'column', fontFamily: 'Pretendard', backgroundColor: C.panel }, photoBox, panel);
}

export async function renderCard(card: CardSpec, photo: RenderPhoto): Promise<Buffer> {
  const svg = await satori(cardTree(card, photo) as never, { width: CARD_W, height: CARD_H, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: CARD_W }, font: { loadSystemFonts: false } }).render().asPng();
  return Buffer.from(png);
}
