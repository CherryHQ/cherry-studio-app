import { expect } from 'e2e';

import { deleteCurrentConversation, exchange, expectChat, expectReply, send } from './conversation';
import { test } from './freshApp';

test(
  'chat.send, common.relaunch-chat, chat.delete-conversation: a conversation keeps its context across a restart, then is deleted',
  { timeout: 480_000 },
  async ({ agent, app, chat, screen }) => {
    const first = exchange('一');
    const second = exchange('二');
    chat.reply(first.question, first.answer);
    chat.reply(second.question, second.answer);

    await send(screen, first.question);
    await expectReply(screen, first.answer);

    // A cold start restores the current conversation.
    await app.restart();
    await expectChat(screen);
    await expect(screen.getByText(first.answer, { exact: false })).toBeVisible();
    await send(screen, second.question);
    await expectReply(screen, second.answer);
    expect(chat.transcriptOf(second.question)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(first.question),
        expect.stringContaining(first.answer),
      ]),
    );

    await deleteCurrentConversation(agent, screen);
    await app.restart();
    await expectChat(screen);
    await expect(screen.getByText(second.answer, { exact: false })).toBeHidden();
  },
);
