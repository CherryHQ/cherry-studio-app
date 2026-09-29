import { useConversationSource } from '../ConversationSourceBoundary';
import { isRemoteConversationSource, type RemoteConversationSource } from './remoteContracts';

/** Remote chat runs inside a desktop source boundary; a local catalog cannot open sessions. */
export function useRemoteConversationSource(): RemoteConversationSource {
  const source = useConversationSource();
  if (!isRemoteConversationSource(source))
    throw new Error('Remote conversation hooks require a desktop ConversationSourceBoundary');
  return source;
}
