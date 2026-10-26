import { requestCardSchema, requestStatus } from '@app/shared';
import { z } from 'zod';
import { type Command, EXIT, Failure, str } from '../command';
import { SLUG } from '../config';

const TABS = ['mine', 'open', 'sent'] as const;

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

    const { requests } = await api.get(`/requests?tab=${tab}`, z.object({ requests: z.array(requestCardSchema) }));
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
        `  ${date.format(new Date(r.startsAt))} · ${requestStatus(r, m)}${r.mySide ? ` · ${m.youAreIn}` : ''}`,
        `  ${r.id}`,
      ].join('\n'),
    );
    return {
      data: { tab, requests },
      text: [`${label}:`, ...(cards.length ? cards : [empty])].join('\n\n'),
    };
  },
};
