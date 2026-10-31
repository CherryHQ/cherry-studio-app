import { expect, unique, type Agent, type Screen } from 'e2e';

// A fresh launch reloads the bundle from Metro before the first screen appears.
export const LAUNCH_TIMEOUT = 90_000;

export async function expectChat(screen: Screen): Promise<void> {
  await expect(screen.getByTestId('chat-composer-input')).toBeVisible({ timeout: LAUNCH_TIMEOUT });
  await expect(screen.getByRole('button', '打开菜单')).toBeVisible();
}

// The answer never appears in the question, so finding it on screen proves the reply arrived.
export function exchange(label: string): { question: string; answer: string } {
  const id = Math.random().toString(36).slice(2, 8);
  return { question: `验收问题 ${label} ${id}`, answer: `验收回复 ${label} ${id}` };
}

export async function send(screen: Screen, text: string): Promise<void> {
  await screen.getByTestId('chat-composer-input').fill(text);
  await screen.getByTestId('chat-composer-send').tap();
}

export async function expectReply(screen: Screen, answer: string): Promise<void> {
  await expect(screen.getByText(answer, { exact: false })).toBeVisible({ timeout: 60_000 });
  // While streaming, the send button turns into stop.
  await expect(screen.getByTestId('chat-composer-send')).toBeVisible({ timeout: 60_000 });
}

// The row menu is a native context menu, so the agent drives it.
export async function deleteCurrentConversation(agent: Agent, screen: Screen): Promise<void> {
  await screen.getByRole('button', '打开菜单').tap();
  const current = screen.getByRole('link', { selected: true });
  await expect(current).toBeVisible();
  const title = (await current.textContent()) ?? '';
  await agent.act(
    'Long-press the conversation {title} in the side menu, choose 删除, then confirm 删除.',
    {
      params: { title: unique(title) },
    },
  );
  await expect(screen.getByRole('link', title)).toBeHidden();
}
