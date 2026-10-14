import {
  Button,
  ContentState,
  Section,
  SelectionIndicator,
  useToast,
} from '@cherrystudio/ui/components';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import type { CherryinSkillLibraryDetail } from '@/shared/contracts/skillMarketplace';
import {
  isSkillsError,
  type SkillInspection,
  type SkillsErrorCode,
} from '@/shared/contracts/skills';
import { cherryinSkillUrl, parseCherryinSkillUrl } from '@/shared/utils/cherryinSkills';

import { SkillPage } from '../SkillPage';
import { marketplaceText } from './skillDiscovery';

const errorCode = (error: unknown): SkillsErrorCode =>
  isSkillsError(error) ? error.code : 'source-unreachable';

export function CherryinSkillScreen() {
  const params = useLocalSearchParams<{ marketplaceId?: string | string[] }>();
  const id = getSingleRouteParam(params.marketplaceId) ?? '';
  return <CherryinSkill key={id} id={id} />;
}

function CherryinSkill({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const skills = useBackendModule('skills');
  const queryClient = useQueryClient();
  const [inspections, setInspections] = useState<SkillInspection[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [failures, setFailures] = useState<Record<string, SkillsErrorCode>>({});
  const [operationError, setOperationError] = useState<SkillsErrorCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [visibleMembers, setVisibleMembers] = useState(20);
  const pending = useRef(false);
  const operation = useRef<AbortController | null>(null);
  const detail = useQuery({
    queryKey: ['skills', 'cherryin-detail', id],
    queryFn: ({ signal }) => skills.getCherryin(id, signal),
    enabled: Boolean(id),
    retry: false,
    staleTime: 60_000,
  });
  const refetch = detail.refetch;
  useFocusEffect(
    useCallback(() => {
      if (id) void refetch();
      return () => operation.current?.abort();
    }, [id, refetch]),
  );

  const data = detail.data;
  const language = i18n.resolvedLanguage ?? i18n.language;
  const isCollection =
    data?.tags.includes('collection') ||
    data?.installed.some((item) => item.entryPath !== 'SKILL.md') ||
    (inspections?.length ?? 0) > 1;
  const installedByEntry = new Map(data?.installed.map((item) => [item.entryPath, item.skillId]));
  const isInstalled = (item: SkillInspection) =>
    installedByEntry.get(parseCherryinSkillUrl(item.candidate.source.url ?? '')?.entryPath ?? '');

  async function prepare(signal: AbortSignal): Promise<SkillInspection[]> {
    const candidates = await skills.resolve(cherryinSkillUrl(id), signal);
    const checked: SkillInspection[] = [];
    for (const candidate of candidates) {
      checked.push(await skills.inspect(candidate.candidateId, signal));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    setInspections(checked);
    return checked;
  }

  async function install(items: SkillInspection[], signal: AbortSignal) {
    const failed: Record<string, SkillsErrorCode> = {};
    const installed = new Map<string, string>();
    for (const item of items) {
      signal.throwIfAborted();
      try {
        const skill = await skills.install({ candidateId: item.candidate.candidateId }, signal);
        installed.set(item.candidate.candidateId, skill.id);
        setSelected((current) => {
          if (!current.has(item.candidate.candidateId)) return current;
          const next = new Set(current);
          next.delete(item.candidate.candidateId);
          return next;
        });
        const entryPath = parseCherryinSkillUrl(item.candidate.source.url ?? '')?.entryPath;
        if (entryPath)
          queryClient.setQueryData<CherryinSkillLibraryDetail>(
            ['skills', 'cherryin-detail', id],
            (current) =>
              current
                ? {
                    ...current,
                    installed: [
                      ...current.installed.filter((entry) => entry.entryPath !== entryPath),
                      { skillId: skill.id, name: skill.name, entryPath },
                    ],
                  }
                : current,
          );
      } catch (error) {
        signal.throwIfAborted();
        failed[item.candidate.candidateId] = errorCode(error);
      }
    }
    if (signal.aborted) return;
    setFailures(failed);
    if (Object.values(failed).includes('candidate-expired')) {
      setOperationError('candidate-expired');
      setInspections(null);
      setSelected(new Set());
      void refetch();
      return;
    }
    setSelected(new Set(Object.keys(failed)));
    void refetch();
    if (items.length === 1 && installed.size === 1 && !isCollection) {
      toast.show({ label: t('skills.toast.installed'), variant: 'success' });
      router.replace({
        pathname: '/skills/[skillId]',
        params: { skillId: [...installed.values()][0]! },
      });
    } else {
      toast.show({
        label: t('skills.marketplace.installResult', {
          installed: installed.size,
          failed: Object.keys(failed).length,
        }),
        variant: Object.keys(failed).length ? 'danger' : 'success',
      });
    }
  }

  async function act() {
    if (pending.current) return;
    pending.current = true;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setOperationError(null);
    try {
      const checked = inspections ?? (await prepare(controller.signal));
      if (checked.length === 1 && !isCollection) {
        const item = checked[0]!;
        const installedId = isInstalled(item);
        if (installedId) {
          router.push({ pathname: '/skills/[skillId]', params: { skillId: installedId } });
        } else if (item.package) await install([item], controller.signal);
      } else if (inspections) {
        await install(
          checked.filter(
            (item) =>
              selected.has(item.candidate.candidateId) && item.package && !isInstalled(item),
          ),
          controller.signal,
        );
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const code = errorCode(error);
        setOperationError(code);
        if (code === 'candidate-expired') {
          setInspections(null);
          setSelected(new Set());
        }
      }
    } finally {
      operation.current = null;
      pending.current = false;
      setBusy(false);
    }
  }

  if (!data)
    return (
      <SkillPage headerProps={{ title: t('skills.candidate.title') }}>
        {detail.isLoading ? (
          <ContentState.Loading title={t('skills.loading')} />
        ) : (
          <ContentState.Error
            title={t(`skills.error.${errorCode(detail.error)}`)}
            primaryAction={{ children: t('common.retry'), onPress: () => void refetch() }}
          />
        )}
      </SkillPage>
    );

  if (data.mobileSupport !== 'supported')
    return (
      <SkillPage headerProps={{ title: t('skills.candidate.title') }}>
        <ContentState.Empty title={t('skills.notFound')} />
      </SkillPage>
    );

  const name = marketplaceText(data.name, language);
  const description = marketplaceText(data.description, language);
  const body = marketplaceText(data.longDescription, language);
  const singleInstalled =
    !isCollection && data.installed.length === 1 ? data.installed[0]!.skillId : null;
  const selectedCount =
    inspections?.filter(
      (item) => selected.has(item.candidate.candidateId) && item.package && !isInstalled(item),
    ).length ?? 0;

  return (
    <SkillPage headerProps={{ title: name }}>
      <Text className="text-base text-foreground" selectable>
        {description}
      </Text>
      <Section title={t('skills.detail.about')}>
        <Section.Item
          label={t('skills.detail.author')}
          trailing={<Text className="text-sm text-muted-foreground">{data.author}</Text>}
        />
        <Section.Item
          label={t('skills.detail.version')}
          trailing={<Text className="text-sm text-muted-foreground">{data.version}</Text>}
        />
        {data.packageSize === null ? null : (
          <Section.Item
            label={t('skills.marketplace.packageSize')}
            trailing={
              <Text className="text-sm text-muted-foreground">
                {(data.packageSize / 1024 / 1024).toLocaleString(language, {
                  maximumFractionDigits: 2,
                })}{' '}
                MiB
              </Text>
            }
          />
        )}
        <Section.Item label="CherryIN" onPress={() => void openExternalUrl(cherryinSkillUrl(id))} />
      </Section>
      {body && body !== description ? (
        <Text className="text-sm text-foreground" selectable>
          {body}
        </Text>
      ) : null}
      {inspections ? (
        <Section title={t('skills.marketplace.contents')}>
          {inspections.slice(0, visibleMembers).map((item) => {
            const candidateId = item.candidate.candidateId;
            const entryPath = parseCherryinSkillUrl(item.candidate.source.url!)?.entryPath ?? '';
            const installedId = installedByEntry.get(entryPath);
            const disabled = busy || !item.package;
            return (
              <Section.Item
                key={candidateId}
                label={item.package?.name ?? item.candidate.name}
                accessibilityRole={installedId ? 'button' : 'checkbox'}
                showChevron={Boolean(installedId)}
                accessibilityState={
                  installedId ? undefined : { checked: selected.has(candidateId), disabled }
                }
                disabled={disabled}
                leading={
                  installedId ? undefined : (
                    <SelectionIndicator
                      control="checkbox"
                      selected={selected.has(candidateId)}
                      disabled={disabled}
                    />
                  )
                }
                onPress={() => {
                  if (installedId)
                    router.push({
                      pathname: '/skills/[skillId]',
                      params: { skillId: installedId },
                    });
                  else
                    setSelected((current) => {
                      const next = new Set(current);
                      if (next.has(candidateId)) next.delete(candidateId);
                      else next.add(candidateId);
                      return next;
                    });
                }}
                description={
                  <View className="gap-1">
                    <Text className="text-sm text-muted-foreground" numberOfLines={2}>
                      {item.package?.description ?? item.candidate.description}
                    </Text>
                    {installedId ? (
                      <Text className="text-sm text-muted-foreground">
                        {t('skills.candidate.openInstalled')}
                      </Text>
                    ) : null}
                    {item.issues.map((issue) => (
                      <Text key={`${issue.code}:${issue.subject}`} className="text-sm text-error">
                        {t(`skills.issue.${issue.code}`, { subject: issue.subject ?? '' })}
                      </Text>
                    ))}
                    {failures[candidateId] ? (
                      <Text className="text-sm text-error">
                        {t(`skills.error.${failures[candidateId]}`)}
                      </Text>
                    ) : null}
                  </View>
                }
              />
            );
          })}
        </Section>
      ) : null}
      {inspections && visibleMembers < inspections.length ? (
        <Button variant="ghost" onPress={() => setVisibleMembers((value) => value + 20)}>
          {t('skills.loadMore')}
        </Button>
      ) : null}
      {operationError ? (
        <Text className="text-sm text-error">{t(`skills.error.${operationError}`)}</Text>
      ) : null}
      {singleInstalled ? (
        <Button
          size="lg"
          onPress={() =>
            router.push({ pathname: '/skills/[skillId]', params: { skillId: singleInstalled } })
          }
        >
          {t('skills.candidate.openInstalled')}
        </Button>
      ) : (
        <Button
          size="lg"
          loading={busy}
          disabled={
            !data.hasPackage ||
            (Boolean(inspections) && Boolean(isCollection) && selectedCount === 0) ||
            (inspections?.length === 1 && !inspections[0]?.package)
          }
          onPress={() => void act()}
        >
          {!data.hasPackage
            ? t('skills.marketplace.noPackage')
            : inspections && isCollection
              ? t('skills.marketplace.installSelected', { total: selectedCount })
              : isCollection
                ? t('skills.marketplace.viewCollection')
                : t('skills.candidate.install')}
        </Button>
      )}
      {data.installed.length > 0 && !singleInstalled ? (
        <Section title={t('skills.library')}>
          {data.installed.map((item) => (
            <Section.Item
              key={item.skillId}
              label={item.name}
              onPress={() =>
                router.push({ pathname: '/skills/[skillId]', params: { skillId: item.skillId } })
              }
            />
          ))}
        </Section>
      ) : null}
    </SkillPage>
  );
}
