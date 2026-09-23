import type { ReactNode } from 'react';

import { RouteHeader, type RouteHeaderProps } from '@/frontend/appShell/header';

import { PluginPage } from '../components/PluginPage';

export function SkillPage({
  children,
  headerProps,
}: {
  children: ReactNode;
  headerProps: RouteHeaderProps;
}) {
  return (
    <>
      <RouteHeader {...headerProps} />
      <PluginPage>{children}</PluginPage>
    </>
  );
}
