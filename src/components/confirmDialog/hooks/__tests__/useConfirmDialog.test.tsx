import { type ReactNode, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useConfirmDialog } from '../useConfirmDialog';

type ConfirmDialogResult = ReturnType<typeof useConfirmDialog>;
let hookResult: ConfirmDialogResult | undefined;

jest.mock('heroui-native/button', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    Button: ({ children, ...props }: { children?: ReactNode }) => (
      <MockView {...props}>{children}</MockView>
    ),
  };
});

jest.mock('heroui-native/dialog', () => {
  const { Text: MockText, View: MockView } = jest.requireActual('react-native');

  const MockDialog = ({ children, ...props }: { children?: ReactNode }) => (
    <MockView {...props}>{children}</MockView>
  );
  MockDialog.Portal = MockDialog;
  MockDialog.Overlay = MockView;
  MockDialog.Content = MockDialog;
  const MockDialogTitle = ({ children }: { children?: ReactNode }) => (
    <MockText>{children}</MockText>
  );
  const MockDialogDescription = ({ children }: { children?: ReactNode }) => (
    <MockText>{children}</MockText>
  );
  MockDialog.Title = MockDialogTitle;
  MockDialog.Description = MockDialogDescription;

  return { Dialog: MockDialog };
});

jest.mock('heroui-native/spinner', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    Spinner: () => <MockView testID="confirm-dialog-spinner" />,
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function Probe() {
  const result = useConfirmDialog();

  useEffect(() => {
    hookResult = result;
  }, [result]);

  return result.confirmDialog;
}

describe('useConfirmDialog', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(async () => {
    hookResult = undefined;
    await act(async () => {
      renderer = create(<Probe />);
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('keeps the dialog open and shows loading while async confirmation is pending', async () => {
    const confirmation = deferred<void>();
    await act(async () => {
      hookResult?.requestConfirm({
        message: 'Delete this item?',
        onConfirm: () => confirmation.promise,
        title: 'Delete?',
      });
    });

    const findDangerButton = () => renderer?.root.findByProps({ variant: 'danger' });
    const findCancelButton = () => renderer?.root.findByProps({ variant: 'secondary' });

    await act(async () => {
      findDangerButton()?.props.onPress();
      await Promise.resolve();
    });

    expect(renderer?.root.findByProps({ testID: 'confirm-dialog-spinner' })).toBeDefined();
    expect(findDangerButton()?.props.isDisabled).toBe(true);
    expect(findCancelButton()?.props.isDisabled).toBe(true);

    confirmation.resolve();
    await act(async () => {
      await confirmation.promise;
      await Promise.resolve();
    });

    expect(renderer?.root.findByProps({ isOpen: false })).toBeDefined();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
