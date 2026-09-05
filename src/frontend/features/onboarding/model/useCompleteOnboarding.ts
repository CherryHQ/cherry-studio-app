import { useAlert } from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { chatHref } from '@/frontend/appShell/navigation/chat';
import { useBackendModule, useMultiplePreferences, useMutation } from '@/frontend/data';
import { useAgentMutations, useAgentsApi } from '@/frontend/hooks/agent';
import type { Agent } from '@/shared/data/types/agent';
import { DEFAULT_DISABLED_AGENT_CAPABILITIES } from '@/shared/data/types/agentCapability';
import { type Model, createUniqueModelId } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

const ONBOARDING_PREFERENCES = {
  defaultModelId: 'agent.default_model_id',
  status: 'app.onboarding.status',
} as const;

type OnboardingModelSelection =
  | { kind: 'catalog'; model: Model; isLocal: boolean }
  | { kind: 'manual'; modelId: string; provider: Provider };

export function useCompleteOnboarding() {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const router = useRouter();
  const queryClient = useQueryClient();
  const models = useBackendModule('models');
  const agents = useAgentsApi();
  const { createAgent, updateAgent } = useAgentMutations();
  const [, savePreferences] = useMultiplePreferences(ONBOARDING_PREFERENCES);
  const createModels = useMutation('POST', '/models', { refresh: ['/models'] });
  const enableModel = useMutation('PATCH', '/models/:uniqueModelId*', { refresh: ['/models'] });
  const enableProvider = useMutation('PATCH', '/providers/:id', {
    refresh: ['/providers', '/providers/page'],
  });
  const createdAgentRef = useRef<Agent | undefined>(undefined);
  const preparedModelsRef = useRef(new Map<string, Model>());
  const requestRef = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'checking' | 'finishing'>('idle');

  useFocusEffect(
    useCallback(() => {
      setPhase('idle');
      return () => {
        requestRef.current?.abort();
        requestRef.current = null;
      };
    }, []),
  );

  const complete = async (selection: OnboardingModelSelection) => {
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const { signal } = controller;
    setPhase('preparing');
    try {
      let modelId;
      let providerId;
      if (selection.kind === 'manual') {
        const uniqueId = createUniqueModelId(selection.provider.id, selection.modelId.trim());
        let model = preparedModelsRef.current.get(uniqueId);
        if (!model) {
          [model] = await createModels.trigger({
            body: [
              {
                endpointTypes: selection.provider.defaultChatEndpoint
                  ? [selection.provider.defaultChatEndpoint]
                  : undefined,
                modelId: selection.modelId.trim(),
                providerId: selection.provider.id,
              },
            ],
          });
          if (!model) throw new Error('Model was not saved');
          preparedModelsRef.current.set(uniqueId, model);
        }
        modelId = model.id;
        providerId = model.providerId;
      } else {
        modelId = selection.model.id;
        providerId = selection.model.providerId;
        if (!selection.isLocal) await models.reconcile(providerId, { toAdd: [selection.model] });
      }
      signal.throwIfAborted();
      setPhase('checking');
      const result = await models.checkChat({ modelId, signal });
      signal.throwIfAborted();
      if (result.status === 'failed') {
        alert.show({
          title: t('onboarding.check.failed'),
          description: t(`onboarding.check.${result.reason}`),
        });
        return;
      }
      setPhase('finishing');
      await Promise.all([
        enableModel.trigger({ params: { uniqueModelId: modelId }, body: { isEnabled: true } }),
        enableProvider.trigger({ params: { id: providerId }, body: { isEnabled: true } }),
      ]);
      signal.throwIfAborted();
      const currentAgents = await agents.refetch();
      if (currentAgents.error) throw currentAgents.error;
      signal.throwIfAborted();
      const items = currentAgents.data?.items ?? [];
      let agent = createdAgentRef.current ?? items.find((item) => item.modelId === modelId);
      if (!agent && items.length === 1 && !items[0].modelId) agent = items[0];
      if (agent) {
        if (agent.modelId !== modelId) agent = await updateAgent(agent.id, { modelId });
      } else {
        agent = await createAgent({
          disabledCapabilities: [...DEFAULT_DISABLED_AGENT_CAPABILITIES],
          modelId,
          name: t('agent.default.name'),
        });
        createdAgentRef.current = agent;
      }
      signal.throwIfAborted();
      await savePreferences(
        { defaultModelId: modelId, status: 'completed' },
        { optimistic: false },
      );
      signal.throwIfAborted();
      await queryClient.invalidateQueries({ queryKey: ['/models'] });
      signal.throwIfAborted();
      router.dismissAll();
      router.replace(chatHref({ agentId: agent.id, kind: 'draft' }));
    } catch {
      if (!signal.aborted)
        alert.show({ title: t('onboarding.saveFailed'), description: t('onboarding.retryHint') });
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setPhase('idle');
      }
    }
  };

  return { complete, phase, cancel: () => requestRef.current?.abort() };
}
