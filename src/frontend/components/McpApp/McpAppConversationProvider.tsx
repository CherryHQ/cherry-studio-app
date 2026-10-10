import { Button, Dialog } from '@cherrystudio/ui/components';
import { createContext, type PropsWithChildren, use, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { useComposerMeta } from '@/frontend/components/Composer';

type AppContextEntry = { key: string; title: string; text: string };
type AppConversationActions = {
  agentId?: string;
  message(text: string): void;
  updateContext(key: string, title: string, text: string): void;
  snapshot(): readonly AppContextEntry[];
  consumed(snapshot: readonly AppContextEntry[]): void;
};
const ActionsContext = createContext<AppConversationActions | null>(null);
const PendingContext = createContext<readonly AppContextEntry[]>([]);

/** Scope stays inside one ComposerSessionProvider, including when a draft becomes a session. */
export function McpAppConversationProvider({
  children,
  enabled,
  agentId,
}: PropsWithChildren<{ enabled: boolean; agentId?: string }>) {
  const { inputRef } = useComposerMeta();
  const pending = useRef<readonly AppContextEntry[]>([]);
  const [entries, setEntries] = useState<readonly AppContextEntry[]>([]);
  const actions = useMemo<AppConversationActions>(() => {
    const publish = (next: readonly AppContextEntry[]) => {
      pending.current = next;
      setEntries(next);
    };
    return {
      agentId,
      message(text) {
        if (!inputRef.current) throw new Error('The conversation input is unavailable.');
        inputRef.current.insertText(`\n${text}\n`);
      },
      updateContext(key, title, text) {
        const others = pending.current.filter((entry) => entry.key !== key);
        publish(text ? [...others.slice(-3), { key, title, text }] : others);
      },
      snapshot: () => pending.current,
      consumed(snapshot) {
        publish(pending.current.filter((entry) => !snapshot.includes(entry)));
      },
    };
  }, [agentId, inputRef]);
  return (
    <ActionsContext value={enabled ? actions : null}>
      <PendingContext value={entries}>{children}</PendingContext>
    </ActionsContext>
  );
}
export function useMcpAppConversation() {
  return use(ActionsContext);
}

/** Context is visible and removable before the user sends the next message. */
export function McpAppContextNotice() {
  const entries = use(PendingContext);
  const actions = useMcpAppConversation();
  const { t } = useTranslation();
  const [reviewing, setReviewing] = useState(false);
  if (!actions || !entries.length) return null;
  return (
    <>
      <Button size="sm" variant="ghost" onPress={() => setReviewing(true)}>
        {t('mcp.apps.context')}
      </Button>
      <Dialog open={reviewing} onOpenChange={setReviewing} title={t('mcp.apps.contextTitle')}>
        <ScrollView className="max-h-96" contentContainerClassName="gap-4">
          {entries.map((entry) => (
            <View className="gap-2" key={entry.key}>
              <Text className="text-base font-semibold text-foreground">{entry.title}</Text>
              <Text className="text-sm text-foreground" selectable>
                {entry.text}
              </Text>
              <Button
                variant="secondary"
                onPress={() => actions.updateContext(entry.key, entry.title, '')}
              >
                {t('mcp.apps.removeContext')}
              </Button>
            </View>
          ))}
        </ScrollView>
        <Button onPress={() => setReviewing(false)}>{t('common.ok')}</Button>
      </Dialog>
    </>
  );
}
