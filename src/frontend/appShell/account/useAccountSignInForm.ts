import { useState } from 'react';

import { rememberAccountReturnTo } from './accountNavigation';
import { useAccount } from './useAccount';
import { useAccountErrorReporter } from './useAccountErrorReporter';

/** Account owns submission; each entry owns its navigation after success. */
export function useAccountSignInForm({
  expired = false,
  isBusy = false,
  returnTo,
}: {
  expired?: boolean;
  isBusy?: boolean;
  returnTo: string;
}) {
  const { account, state } = useAccount();
  const reportError = useAccountErrorReporter('AccountSignInForm');
  const lockedAddress = expired ? state.privateAddress : undefined;
  const lockedUsername = lockedAddress ? state.privateUsername : undefined;
  const [isPrivate, setIsPrivate] = useState(Boolean(lockedAddress));
  const [address, setAddress] = useState(state.privateAddress ?? '');
  const [username, setUsername] = useState(lockedUsername ?? '');
  const [password, setPassword] = useState('');
  const busy = isBusy || state.isBusy;
  const canSignIn = !busy && (!isPrivate || Boolean(address.trim() && username.trim() && password));
  const signIn = async () => {
    if (!canSignIn) return false;
    try {
      rememberAccountReturnTo(returnTo);
      return await account.signIn(isPrivate ? { address, username, password } : undefined);
    } catch (error) {
      reportError(error, 'account.signIn');
      return false;
    }
  };
  const switchMethod = () => {
    setPassword('');
    setIsPrivate((current) => !current);
  };
  return {
    address,
    username,
    password,
    setAddress,
    setUsername,
    setPassword,
    isPrivate,
    isBusy: busy,
    canSignIn,
    signIn,
    switchMethod,
    isAddressLocked: Boolean(lockedAddress),
    isUsernameLocked: Boolean(lockedUsername),
  };
}
