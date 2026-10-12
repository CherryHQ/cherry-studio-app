import { Section } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';

/** One titled group on the plugins page. */
export function PluginGroup({
  children,
  testID,
  title,
}: {
  children: ReactNode;
  testID?: string;
  title: string;
}) {
  return (
    <Section testID={testID} title={title}>
      {children}
    </Section>
  );
}
