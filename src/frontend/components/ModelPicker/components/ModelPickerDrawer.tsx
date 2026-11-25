import EyeIcon from '@cherrystudio/app-icons/icons/eye';
import {
  ActionMenu,
  BottomSheet,
  type BottomSheetSize,
  type BottomSheetSizes,
  Button,
  ContentState,
  SearchField,
} from '@cherrystudio/ui/components';
import { useGlobalSearchParams } from 'expo-router';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCloudModelBrowser, useReturnedCloudModel } from '@/frontend/appShell/cloud';
import {
  chatReturnToHref,
  parseChatRoute,
  type ChatRouteParamsInput,
} from '@/frontend/appShell/navigation/chat';
import { EmptyIllustration } from '@/frontend/components/EmptyIllustration';
import { ModelRegistryGate } from '@/frontend/components/ModelRegistry';
import { useModelChoice } from '@/frontend/components/Policy';
import { matchesSearchKeywords, toSearchKeywords } from '@/frontend/utils/search';
import {
  CLOUD_PROVIDER_ID,
  CLOUD_PROVIDER_NAME,
  type CloudModelUse,
} from '@/shared/contracts/cloud';
import { isEnterpriseProfile } from '@/shared/data/activeProfile';
import { capabilityPolicy } from '@/shared/data/managedPolicy';

import { useModelPickerData } from '../hooks/useModelPickerData';
import {
  MODEL_PICKER_BADGES,
  matchesModelPickerBadges,
  type ModelPickerBadge,
} from '../utils/modelPickerBadges';
import { addCloudOffers, EMPTY_CHERRY_AI_GROUP } from '../utils/modelPickerCloudOffers';
import type { ModelPickerModelItem } from '../utils/modelPickerData';
import { buildModelPickerListItems } from '../utils/modelPickerListItems';
import type { ModelTypeFilter } from '../utils/modelTypeFilter';
import { ModelPickerBadge as ModelBadge } from './ModelPickerBadge';
import { ModelPickerCherryAiEntry } from './ModelPickerCherryAiEntry';
import { ModelPickerFilterIcon } from './ModelPickerFilterIcon';
import { ModelPickerList } from './ModelPickerList';

export type ModelPickerDrawerVariant = 'default' | 'chat' | 'usage';

const modelPickerSizes = ['medium', 'full'] as const satisfies BottomSheetSizes;

type ModelPickerDrawerProps = {
  cloudUse?: CloudModelUse;
  /** Destination for resuming this model selection after community sign-in. */
  loginReturnTo?: string;
  emptyText?: string;
  isModelVisible?: (item: ModelPickerModelItem) => boolean;
  modelType: ModelTypeFilter;
  onAddProvider?: () => void;
  onClose: () => void;
  onSelect: (item: ModelPickerModelItem) => void;
  open: boolean;
  providerId?: string;
  selectedModelId: string | null;
  /**
   * Offers a multi-select mode behind a header button. While enabled, a row tap
   * toggles the model through `onSelect`; the choice applies as it changes, so the sheet
   * needs no confirm step.
   */
  multiSelect?: ModelPickerMultiSelect;
  title?: string;
  variant?: ModelPickerDrawerVariant;
};

export type ModelPickerMultiSelect = {
  enabled: boolean;
  /** Leaving the mode returns to the caller's default choice. */
  onEnabledChange: (enabled: boolean) => void;
  /** In pick order. */
  selectedModelIds: readonly string[];
  maxCount: number;
};

/** The complete model-picking interaction; callers only supply business state and actions. */
export function ModelPickerDrawer({
  cloudUse = 'agent',
  loginReturnTo,
  emptyText,
  isModelVisible,
  modelType,
  onAddProvider,
  onClose,
  onSelect,
  open,
  providerId,
  selectedModelId,
  multiSelect,
  title,
  variant = 'default',
}: ModelPickerDrawerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [isMounted, setIsMounted] = useState(open);
  const [sheetSize, setSheetSize] = useState<BottomSheetSize>('medium');
  const [searchText, setSearchText] = useState('');
  const [selectedBadge, setSelectedBadge] = useState<ModelPickerBadge | null>(null);
  const deferredSearchText = useDeferredValue(searchText);
  // The sheet renders through a portal at the app root, outside the screen's PolicyScope.
  const { allowedModelIds } = useModelChoice();

  if (open && !isMounted) {
    setIsMounted(true);
  }

  const resetState = useCallback(() => {
    setSheetSize('medium');
    setSearchText('');
    setSelectedBadge(null);
  }, []);
  const handleSearchFocus = useCallback(() => setSheetSize('full'), []);
  const handleClose = useCallback(() => {
    resetState();
    setIsMounted(false);
    onClose();
  }, [onClose, resetState]);
  const handleClosed = useCallback(() => {
    resetState();
    if (!open) {
      setIsMounted(false);
    }
  }, [open, resetState]);

  if (!isMounted) {
    return null;
  }

  return (
    <BottomSheet
      avoidKeyboard
      bodyInset="none"
      headerAction={
        // A mode entered and left like selecting photos, not a setting the sheet keeps.
        multiSelect ? (
          <Button
            onPress={() => multiSelect.onEnabledChange(!multiSelect.enabled)}
            size="sm"
            testID="model-picker-multi-select"
            variant="ghost"
          >
            <Button.Label>
              {t(
                multiSelect.enabled
                  ? 'modelPicker.multiSelect.exit'
                  : 'modelPicker.multiSelect.label',
              )}
            </Button.Label>
          </Button>
        ) : undefined
      }
      onClose={handleClose}
      onClosed={handleClosed}
      onSizeChange={setSheetSize}
      open={open}
      presentation="default"
      size={sheetSize}
      sizes={modelPickerSizes}
      testID="model-picker"
      title={
        multiSelect?.enabled
          ? t('modelPicker.multiSelect.title', {
              max: multiSelect.maxCount,
              selected: multiSelect.selectedModelIds.length,
            })
          : (title ?? t('modelPicker.title'))
      }
    >
      <ModelRegistryGate>
        <ModelPickerDrawerContent
          cloudUse={cloudUse}
          loginReturnTo={loginReturnTo}
          allowedModelIds={allowedModelIds}
          bottomInset={insets.bottom}
          deferredSearchText={deferredSearchText}
          emptyText={emptyText}
          isModelVisible={isModelVisible}
          modelType={modelType}
          onAddProvider={onAddProvider}
          onClose={handleClose}
          onSelect={onSelect}
          onSearchFocus={handleSearchFocus}
          onSearchTextChange={setSearchText}
          open={open}
          providerId={providerId}
          searchText={searchText}
          multiSelect={multiSelect?.enabled ? multiSelect : undefined}
          selectedModelId={selectedModelId}
          selectedBadge={selectedBadge}
          setSelectedBadge={setSelectedBadge}
          variant={variant}
        />
      </ModelRegistryGate>
    </BottomSheet>
  );
}

function ModelPickerDrawerContent({
  cloudUse,
  loginReturnTo,
  allowedModelIds,
  bottomInset,
  deferredSearchText,
  emptyText,
  isModelVisible,
  modelType,
  onAddProvider,
  onClose,
  onSelect,
  onSearchFocus,
  onSearchTextChange,
  open,
  providerId,
  searchText,
  selectedModelId,
  multiSelect,
  selectedBadge,
  setSelectedBadge,
  variant,
}: Pick<
  ModelPickerDrawerProps,
  | 'loginReturnTo'
  | 'cloudUse'
  | 'isModelVisible'
  | 'emptyText'
  | 'modelType'
  | 'onAddProvider'
  | 'onClose'
  | 'onSelect'
  | 'open'
  | 'providerId'
  | 'selectedModelId'
  | 'multiSelect'
  | 'variant'
> & {
  allowedModelIds: ReadonlySet<string> | null;
  bottomInset: number;
  deferredSearchText: string;
  onSearchFocus: () => void;
  onSearchTextChange: (value: string) => void;
  searchText: string;
  selectedBadge: ModelPickerBadge | null;
  setSelectedBadge: (badge: ModelPickerBadge | null) => void;
}) {
  const { t } = useTranslation();
  const { error, groups, hasLoadedCatalog, isLoading, providers, refresh } = useModelPickerData({
    cloudUse,
    modelType,
    providerId,
    searchText: deferredSearchText,
  });
  const filteredGroups = useMemo(
    () =>
      selectedBadge === null
        ? groups
        : groups.flatMap((group) => {
            const items = group.items.filter((item) =>
              matchesModelPickerBadges(item.model, [selectedBadge], item.isCloudFree),
            );
            return items.length > 0 ? [{ ...group, items }] : [];
          }),
    [groups, selectedBadge],
  );
  const visibleGroups = useMemo(
    () =>
      isModelVisible || allowedModelIds
        ? filteredGroups.flatMap((group) => {
            const items = group.items.filter(
              (item) =>
                (allowedModelIds?.has(item.modelId) ?? true) && (isModelVisible?.(item) ?? true),
            );
            return items.length > 0 ? [{ ...group, items }] : [];
          })
        : filteredGroups,
    [allowedModelIds, filteredGroups, isModelVisible],
  );
  const hasActiveFilters = selectedBadge !== null;
  const hasConditions = deferredSearchText.trim().length > 0 || hasActiveFilters;
  const showBadges = variant !== 'default';
  const canOfferCherryAi =
    variant === 'chat' &&
    !isEnterpriseProfile() &&
    allowedModelIds === null &&
    !isModelVisible &&
    modelType !== 'image' &&
    providers.some((provider) => provider.id === CLOUD_PROVIDER_ID);
  const {
    state: cloudState,
    accountState,
    offers,
    press,
    refresh: refreshCloud,
    signInAgain,
  } = useCloudModelBrowser(canOfferCherryAi && open, cloudUse);
  const { sessionId, agentId, workspaceDraftId, sshDraftId } =
    useGlobalSearchParams<ChatRouteParamsInput>();
  const chat = parseChatRoute({ sessionId, agentId, workspaceDraftId, sshDraftId });
  const returnTo = loginReturnTo ?? (chat.status === 'ready' ? chatReturnToHref(chat.target) : '/');
  const pressCloudOffer = useCallback(
    (id: string) => {
      press(id, returnTo, onClose, Boolean(loginReturnTo));
    },
    [loginReturnTo, onClose, press, returnTo],
  );
  const amdName = t('cloud.amd.title');
  const keywords = useMemo(() => toSearchKeywords(deferredSearchText), [deferredSearchText]);
  const displayGroups = useMemo(
    () =>
      canOfferCherryAi
        ? addCloudOffers(visibleGroups, offers, keywords, selectedBadge, amdName)
        : visibleGroups,
    [amdName, canOfferCherryAi, keywords, offers, selectedBadge, visibleGroups],
  );
  useReturnedCloudModel({
    pathname: '/',
    destination: returnTo,
    enabled: Boolean(loginReturnTo) && open && hasLoadedCatalog,
    state: cloudState,
    account: accountState,
    resume: (id) => {
      const item = visibleGroups
        .flatMap((group) => group.items)
        .find((item) => item.model.providerId === CLOUD_PROVIDER_ID && item.model.modelId === id);
      const offer = offers.get(id);
      if (offer && !offer.reason && !item && canOfferCherryAi) return undefined;
      return () => {
        if (item && !item.cloudUnavailable && canOfferCherryAi && offer && !offer.reason)
          onSelect(item);
        else if (canOfferCherryAi) pressCloudOffer(id);
      };
    },
  });
  const showCherryAiEntry =
    canOfferCherryAi &&
    hasLoadedCatalog &&
    !hasActiveFilters &&
    !displayGroups.some((group) => group.provider.id === CLOUD_PROVIDER_ID) &&
    matchesSearchKeywords(keywords, [CLOUD_PROVIDER_NAME, amdName]);
  const listItems = useMemo(
    () =>
      buildModelPickerListItems(
        showCherryAiEntry ? [EMPTY_CHERRY_AI_GROUP, ...displayGroups] : displayGroups,
      ),
    [displayGroups, showCherryAiEntry],
  );
  const showCloudEntry =
    showCherryAiEntry ||
    (canOfferCherryAi && (cloudState.phase === 'error' || cloudState.guestCatalog === 'error'));
  const cherryAiEntry = useMemo(
    () =>
      showCloudEntry ? (
        <ModelPickerCherryAiEntry
          state={cloudState}
          restoring={accountState.isRestoringSession}
          onRetry={
            cloudState.accountIssue === 'reauth_required'
              ? () => {
                  onClose();
                  signInAgain(returnTo);
                }
              : refreshCloud
          }
        />
      ) : undefined,
    [
      accountState.isRestoringSession,
      cloudState,
      refreshCloud,
      showCloudEntry,
      onClose,
      returnTo,
      signInAgain,
    ],
  );
  const waitingForCatalog = isLoading || (!hasLoadedCatalog && !error);
  const emptyAction =
    // Enterprise providers come from the organization and cannot be added here.
    hasConditions
      ? {
          label: t('modelPicker.clearConditions'),
          onPress: () => {
            onSearchTextChange('');
            setSelectedBadge(null);
          },
          variant: 'text' as const,
        }
      : onAddProvider &&
          allowedModelIds === null &&
          capabilityPolicy('providerSettings').canEdit('providerSettings')
        ? {
            label: t('modelPicker.addProvider'),
            onPress: onAddProvider,
            variant: 'default' as const,
          }
        : undefined;
  const filterIcon =
    selectedBadge === 'vision' ? (
      <EyeIcon className="text-tag-blue-foreground" />
    ) : selectedBadge === 'free' ? (
      <ModelBadge badge="free" testIDPrefix="model-picker-filter-badge" />
    ) : (
      <ModelPickerFilterIcon />
    );

  return (
    <View className="min-h-0 flex-1">
      <View className="flex-row items-center gap-2 px-5 pb-2">
        <View className="min-w-0 flex-1">
          <SearchField
            accessibilityLabel={t('modelPicker.searchPlaceholder')}
            clearAccessibilityLabel={t('common.clear')}
            onChangeText={onSearchTextChange}
            onClear={() => onSearchTextChange('')}
            onFocus={onSearchFocus}
            onSubmitEditing={Keyboard.dismiss}
            placeholder={t('modelPicker.searchPlaceholder')}
            testID="model-picker-search"
            value={searchText}
            variant="subtle"
          />
        </View>
        {showBadges ? (
          <ActionMenu
            items={[
              {
                checked: selectedBadge === null,
                id: 'all',
                label: t('settings.provider.models.purpose.all'),
                onPress: () => setSelectedBadge(null),
              },
              ...MODEL_PICKER_BADGES.map((badge) => ({
                checked: selectedBadge === badge,
                id: badge,
                label: t(modelPickerBadgeLabelKeys[badge]),
                onPress: () => setSelectedBadge(badge),
              })),
            ]}
          >
            <Button
              accessibilityLabel={t('common.filter')}
              accessibilityState={{ selected: hasActiveFilters }}
              accessibilityValue={
                selectedBadge ? { text: t(modelPickerBadgeLabelKeys[selectedBadge]) } : undefined
              }
              icon={filterIcon}
              testID="model-picker-filter"
              variant="ghost"
            />
          </ActionMenu>
        ) : null}
      </View>
      <View className="min-h-0 flex-1">
        {!waitingForCatalog && error && listItems.length === 0 ? (
          <View className="flex-1 justify-center px-6 py-8">
            <ContentState.Error
              primaryAction={{ children: t('common.retry'), onPress: () => void refresh() }}
              title={t('settings.provider.models.syncRecovery.failed')}
            />
          </View>
        ) : (
          <ModelPickerList
            bottomInset={bottomInset}
            cherryAiEntry={cherryAiEntry}
            emptyAction={emptyAction}
            emptyIcon={
              hasLoadedCatalog ? (
                <EmptyIllustration
                  scene={hasConditions || groups.length > 0 ? 'search' : 'connection'}
                  size="panel"
                />
              ) : undefined
            }
            emptyText={
              hasConditions
                ? t('settings.provider.models.search.empty')
                : (emptyText ?? t('modelPicker.empty'))
            }
            isLoading={waitingForCatalog}
            isOpen={open}
            listItems={listItems}
            loadingText={t('settings.provider.models.loading')}
            onCloudOffer={canOfferCherryAi ? pressCloudOffer : undefined}
            onSelect={onSelect}
            maxSelectedCount={multiSelect?.maxCount}
            selectedModelIds={multiSelect?.selectedModelIds}
            selectedModelId={selectedModelId}
            showBadges={showBadges}
          />
        )}
      </View>
    </View>
  );
}

const modelPickerBadgeLabelKeys = {
  free: 'models.capability.free',
  vision: 'models.capability.imageRecognition',
} as const satisfies Record<ModelPickerBadge, string>;
