import { expect } from 'e2e';

import { deleteCurrentConversation, exchange, expectChat, expectReply, send } from './conversation';
import { test } from './freshApp';

test(
  'chat.agent-create, chat.agent-chat, chat.agent-delete: a new Agent answers with its instructions, survives a restart and is deleted',
  { timeout: 480_000 },
  async ({ agent, app, chat, screen }) => {
    const id = Date.now().toString(36);
    const name = `验收智能体 ${id}`;
    const instructions = `验收指令 ${id}`;
    const turn = exchange('智能体');
    chat.reply(turn.question, turn.answer);
    const header = screen.getByTestId('current-agent-label');

    // Creating from the header picker opens a draft conversation with the new Agent.
    await header.tap();
    await screen.getByRole('button', '新建智能体').tap();
    const nameField = screen.getByPlaceholder('智能体名称');
    await nameField.fill(name);
    await expect(nameField).toHaveValue(name);
    await screen.getByLabel('指令').fill(instructions);
    await screen.getByRole('button', '保存').tap();
    await expect(header).toHaveAccessibleName(name, { timeout: 30_000 });
    await send(screen, turn.question);
    await expectReply(screen, turn.answer);
    expect(chat.transcriptOf(turn.question)).toEqual(
      expect.arrayContaining([expect.stringContaining(instructions)]),
    );

    await app.restart();
    await expectChat(screen);
    await expect(header).toHaveAccessibleName(name);
    await expect(screen.getByText(turn.answer, { exact: false })).toBeVisible();

    // Deleting an Agent keeps its conversations, so remove this run's conversation first.
    await deleteCurrentConversation(agent, screen);
    await screen.getByRole('button', '智能体').tap();
    await screen.getByRole('link', name).tap();
    await screen.getByTestId('agent-delete').tap();
    await screen.getByRole('button', '删除').tap();
    await expect(screen.getByRole('button', '新建智能体')).toBeVisible();
    await expect(screen.getByRole('link', name)).toBeHidden();
  },
);
