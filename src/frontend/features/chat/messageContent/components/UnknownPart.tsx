import { PartPlaceholder } from './PartPlaceholder';

type UnknownPartProps = {
  type: string;
};

export function UnknownPart({ type }: UnknownPartProps) {
  return <PartPlaceholder icon="data" label={type} />;
}
