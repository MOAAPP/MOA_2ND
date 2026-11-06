/**
 * Fast, deterministic Korean one-line expense entry.
 *
 * The LAST recognisable amount is chosen (e.g. "아이폰 16 케이스 9,900원").
 * This is a local convenience parser, not an AI result or a bank SMS parser.
 * Ambiguous multi-line bank SMS belong to PasteFlow.
 */
export interface QuickExpenseValue { name: string; amount: number }

const AMOUNT = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(만원|천원|원|만|천)?/g;

export function parseQuickExpense(raw: string): QuickExpenseValue | null {
  const input = raw.trim();
  if (!input || /[\r\n]/.test(input)) return null;
  const matches = [...input.matchAll(AMOUNT)];
  if (!matches.length) return null;
  // A written currency amount is less ambiguous than product model digits.
  const choice = [...matches].reverse().find(m => m[3]) ?? matches.at(-1)!;
  const unit = choice[3] ?? '';
  const number = Number((choice[1] + (choice[2] ? '.' + choice[2] : '')).replace(/,/g, ''));
  const multiplier = unit === '만' || unit === '만원' ? 10000 : unit === '천' || unit === '천원' ? 1000 : 1;
  const amount = Math.round(number * multiplier);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10_000_000) return null;
  const name = (input.slice(0, choice.index) + input.slice((choice.index ?? 0) + choice[0].length))
    .replace(/^[\s·,./\-:]+|[\s·,./\-:]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 30);
  return { name: name || '지출', amount };
}
