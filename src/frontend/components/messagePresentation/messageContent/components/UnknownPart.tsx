import { MessagePart } from '@cherrystudio/ui/components';

type UnknownPartProps = {
  type: string;
};

export function UnknownPart({ type }: UnknownPartProps) {
  return <MessagePart.Placeholder label={type} />;
}
