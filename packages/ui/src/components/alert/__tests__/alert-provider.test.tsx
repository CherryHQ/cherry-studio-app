import { useEffect } from 'react';
import { Keyboard } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AlertProvider } from '../components/alert-provider';
import { useAlert } from '../hooks/use-alert';

jest.mock('../components/alert/alert', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  return {
    Alert: (props: object) => React.createElement(View, { ...props, mockComponent: 'alert' }),
  };
});

type AlertController = ReturnType<typeof useAlert>['alert'];

const labels = { cancel: 'Cancel', ok: 'OK' };
let alertController: AlertController | undefined;
let renderer: ReactTestRenderer | undefined;

function Probe() {
  const { alert } = useAlert();

  useEffect(() => {
    alertController = alert;
  }, [alert]);

  return null;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('AlertProvider', () => {
  beforeEach(async () => {
    alertController = undefined;
    jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    await act(async () => {
      renderer = create(
        <AlertProvider labels={labels}>
          <Probe />
        </AlertProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    jest.restoreAllMocks();
  });

  it('closes a confirmation without awaiting its action', async () => {
    const confirmation = deferred<void>();

    act(() => {
      alertController?.confirm({
        confirmLabel: 'Delete',
        onConfirm: () => confirmation.promise,
        role: 'destructive',
        title: 'Delete item?',
      });
    });
    await flushEffects();

    let alert = renderer!.root.findByProps({ mockComponent: 'alert' });
    expect(alert.props.isOpen).toBe(true);
    expect(alert.props.actions.map((action: { label: string }) => action.label)).toEqual([
      'Cancel',
      'Delete',
    ]);

    act(() => {
      alert.props.actions[1].onPress();
      alert.props.onOpenChange(false);
    });
    await flushEffects();

    alert = renderer!.root.findByProps({ mockComponent: 'alert' });
    expect(alert.props.isOpen).toBe(false);
    confirmation.resolve();
    await confirmation.promise;
  });

  it('keeps the active alert until native close and then advances the queue', async () => {
    const onConfirm = jest.fn(() => alertController?.show({ title: 'Delete failed' }));

    act(() => {
      alertController?.confirm({ confirmLabel: 'Delete', onConfirm, title: 'Delete item?' });
    });
    await flushEffects();

    let alert = renderer!.root.findByProps({ mockComponent: 'alert' });
    act(() => alert.props.actions[1].onPress());

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findByProps({ mockComponent: 'alert' }).props.title).toBe('Delete item?');

    act(() => alert.props.onOpenChange(false));
    await flushEffects();

    alert = renderer!.root.findByProps({ mockComponent: 'alert' });
    expect(alert.props.isOpen).toBe(true);
    expect(alert.props.title).toBe('Delete failed');
    expect(alert.props.actions[0].label).toBe('OK');
  });

  it('keeps showing messages after the requesting consumer unmounts', async () => {
    const persistentAlert = alertController;

    await act(async () => {
      renderer?.update(<AlertProvider labels={labels} />);
    });
    act(() => {
      persistentAlert?.show({ title: 'Background failure' });
    });
    await flushEffects();

    const alert = renderer!.root.findByProps({ mockComponent: 'alert' });
    expect(alert.props.isOpen).toBe(true);
    expect(alert.props.title).toBe('Background failure');
  });

  it('controls prompt input and confirms with its latest value', async () => {
    const onConfirm = jest.fn();

    act(() => {
      alertController?.prompt({
        confirmLabel: 'Save',
        input: {
          accessibilityLabel: 'Topic name',
          autoFocus: true,
          initialValue: 'Original topic',
          maxLength: 255,
          placeholder: 'Enter topic name',
        },
        onConfirm,
        title: 'Rename topic',
      });
    });
    await flushEffects();

    let alert = renderer!.root.findByProps({ mockComponent: 'alert' });
    expect(alert.props.input).toEqual(
      expect.objectContaining({
        accessibilityLabel: 'Topic name',
        autoFocus: true,
        maxLength: 255,
        placeholder: 'Enter topic name',
        value: 'Original topic',
      }),
    );

    act(() => alert.props.input.onChangeText('Renamed topic'));
    alert = renderer!.root.findByProps({ mockComponent: 'alert' });
    expect(alert.props.input.value).toBe('Renamed topic');

    act(() => {
      alert.props.actions[1].onPress();
      alert.props.onOpenChange(false);
    });
    expect(onConfirm).toHaveBeenCalledWith('Renamed topic');
    await flushEffects();
    expect(renderer!.root.findByProps({ mockComponent: 'alert' }).props.isOpen).toBe(false);
  });

  it('dismisses the keyboard before confirm and prompt alerts', () => {
    act(() => {
      alertController?.confirm({
        confirmLabel: 'Continue',
        onConfirm: jest.fn(),
        title: 'Confirm',
      });
      alertController?.prompt({
        confirmLabel: 'Save',
        input: { accessibilityLabel: 'Prompt value', initialValue: '' },
        onConfirm: jest.fn(),
        title: 'Prompt',
      });
      alertController?.show({ title: 'Information' });
    });

    expect(Keyboard.dismiss).toHaveBeenCalledTimes(2);
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
