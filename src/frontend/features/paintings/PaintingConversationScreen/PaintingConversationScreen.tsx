import { Redirect, useLocalSearchParams } from 'expo-router';

export function PaintingConversationScreen() {
  const params = useLocalSearchParams<{ paintingId?: string | string[] }>();
  const paintingId = firstParam(params.paintingId);

  return (
    <Redirect
      href={
        paintingId ? { pathname: '/paintings', params: { paintingId } } : { pathname: '/paintings' }
      }
    />
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
