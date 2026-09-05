import type { Provider } from '@/shared/data/types/provider';

import type { ModelPickerModelItem } from '../modelPickerData';
import {
  buildModelPickerFastScrollNavigation,
  modelPickerFastScrollIndexAtPosition,
} from '../modelPickerFastScroll';
import type { ModelPickerListItem } from '../modelPickerListItems';

describe('model picker fast scroll', () => {
  test('adds one target per provider and maps every model to its provider', () => {
    const openai = provider('openai', 'OpenAI');
    const anthropic = provider('anthropic', 'Anthropic');
    const navigation = buildModelPickerFastScrollNavigation([
      header(openai),
      model('qwen-2', 'Qwen 2', openai),
      model('qwen-3', 'Qwen 3', openai),
      model('gpt-4o', 'GPT-4o', openai),
      header(anthropic),
      model('qwen-max', 'Qwen Max', anthropic),
    ]);

    expect(navigation.anchors).toEqual([
      {
        key: 'header:openai',
        label: 'OpenAI',
        listIndex: 0,
        provider: openai,
      },
      {
        key: 'header:anthropic',
        label: 'Anthropic',
        listIndex: 4,
        provider: anthropic,
      },
    ]);
    expect(navigation.anchorIndexByListIndex).toEqual([0, 0, 0, 0, 1, 1]);
    expect(navigation.modelCount).toBe(4);
  });

  test('maps inset rail positions to navigation entries and clamps overflow', () => {
    expect(modelPickerFastScrollIndexAtPosition(8, 116, 5, 8)).toBe(0);
    expect(modelPickerFastScrollIndexAtPosition(47, 116, 5, 8)).toBe(1);
    expect(modelPickerFastScrollIndexAtPosition(48, 116, 5, 8)).toBe(2);
    expect(modelPickerFastScrollIndexAtPosition(108, 116, 5, 8)).toBe(4);
    expect(modelPickerFastScrollIndexAtPosition(0, 116, 5, 8)).toBe(0);
    expect(modelPickerFastScrollIndexAtPosition(116, 116, 5, 8)).toBe(4);
  });

  test('returns no target for empty or unmeasured rails', () => {
    expect(modelPickerFastScrollIndexAtPosition(20, 0, 5, 8)).toBe(-1);
    expect(modelPickerFastScrollIndexAtPosition(20, 100, 0, 8)).toBe(-1);
  });
});

function provider(id: string, name: string): Provider {
  return { id, isEnabled: true, name, presetProviderId: id } as Provider;
}

function header(providerItem: Provider): ModelPickerListItem {
  return {
    isFirstGroup: false,
    key: `header:${providerItem.id}`,
    provider: providerItem,
    title: providerItem.name,
    type: 'groupHeader',
  };
}

function model(modelId: string, name: string, providerItem: Provider): ModelPickerListItem {
  const item = {
    key: `${providerItem.id}:${modelId}`,
    model: {
      id: `${providerItem.id}::${modelId}`,
      modelId,
      name,
    },
    modelId: `${providerItem.id}::${modelId}`,
    provider: providerItem,
  } as ModelPickerModelItem;

  return { item, key: item.key, type: 'model' };
}
