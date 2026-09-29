import { createShareReturnGate } from '../shareReturnGate';

test('waits for Android to resume and regain focus before returning from an external target', () => {
  const onReturn = jest.fn();
  const gate = createShareReturnGate(true, onReturn);

  gate.suspend();
  gate.onBlur();
  gate.onAppStateChange('background');
  gate.request();
  gate.onAppStateChange('active');
  expect(onReturn).not.toHaveBeenCalled();

  gate.onFocus();
  expect(onReturn).toHaveBeenCalledTimes(1);
  gate.onFocus();
  expect(onReturn).toHaveBeenCalledTimes(1);
});

test('returns after a cancelled chooser has already restored focus', () => {
  const onReturn = jest.fn();
  const gate = createShareReturnGate(true, onReturn);

  gate.suspend();
  gate.onBlur();
  gate.onAppStateChange('background');
  gate.onFocus();
  gate.onAppStateChange('active');
  gate.request();

  expect(onReturn).toHaveBeenCalledTimes(1);
});

test('does not return after the export route unmounts', () => {
  const onReturn = jest.fn();
  const gate = createShareReturnGate(true, onReturn);

  gate.suspend();
  gate.request();
  gate.dispose();
  gate.onFocus();

  expect(onReturn).not.toHaveBeenCalled();
});
