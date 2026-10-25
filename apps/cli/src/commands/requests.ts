import { FORMATS, type Messages, SUPPORTERS_NEEDED } from '@app/shared';
import { z } from 'zod';
import { type Command, EXIT, Failure, str } from '../command';
import { SLUG } from '../config';

const TABS = ['mine', 'open', 'sent'] as const;

const bubbleSchema = z.object({ id: z.string(), name: z.string(), color: z.string() });

// RequestCard in @app/shared
const cardSchema = z.object({
  id: z.string(),
  from: bubbleSchema,
  to: bubbleSchema,
  question: z.string(),
  format: z.enum(FORMATS),
  place: z.string(),
  startsAt: z.string(),
  seats: z.number(),
  fromCount: z.number(),
  toCount: z.number(),
  sentAt: z.string().nullable(),
  acceptedAt: z.string().nullable(),
  doneAt: z.string().nullable(),
  mySide: z.enum(['from', 'to']).nullable(),
});
type Card = z.infer<typeof cardSchema>;

// Where a request stands, as the cards in the web show it (apps/web/src/lib/format.ts)
function status(r: Card, m: Messages) {
  if (r.doneAt) return m.statusDone;
  if (r.acceptedAt) return m.statusRunning;
  if (!r.sentAt) return m.statusNeedsSupport(SUPPORTERS_NEEDED - r.fromCount, r.from.name);
  if (!r.toCount) return m.statusNobodyYet;
  return m.statusJoined(r.toCount, r.seats, r.to.name);
}

// The board the web opens after login, one tab at a time
export const requests: Command = {
  help: (m) => [['requests [--tab mine|open|sent]', m.cliRequestsHelp]],
  options: { tab: { type: 'string' } },
  async run({ values, m, locale, api, session }) {
    const tab = TABS.find((name) => name === (str(values.tab) ?? 'mine'));
    if (!tab) {
      throw new Failure(m.cliBadOptions('--tab mine|open|sent', SLUG), EXIT.usage);
    }
    if (!session) throw new Failure(m.notLoggedIn, EXIT.loggedOut);

    const { requests } = await api.get(`/requests?tab=${tab}`, z.object({ requests: z.array(cardSchema) }));
    const label = { mine: m.tabMine, open: m.tabOpen, sent: m.tabSent }[tab];
    const empty = { mine: m.emptyMine, open: m.emptyOpen, sent: m.emptySent }[tab];
    const date = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const cards = requests.map((r) =>
      [
        m.quoted(r.question),
        `  ${r.from.name} → ${r.to.name} · ${m.formatShort[r.format]} · ${r.seats} + ${r.seats}`,
        `  ${date.format(new Date(r.startsAt))} · ${status(r, m)}${r.mySide ? ` · ${m.youAreIn}` : ''}`,
        `  ${r.id}`,
      ].join('\n'),
    );
    return {
      data: { tab, requests },
      text: [`${label}:`, ...(cards.length ? cards : [empty])].join('\n\n'),
    };
  },
};
