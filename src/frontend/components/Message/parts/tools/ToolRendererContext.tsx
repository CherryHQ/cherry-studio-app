import { createContext, type PropsWithChildren, type ReactNode, use } from 'react';
import { useTranslation } from 'react-i18next';

import { builtInToolDefinitions } from './builtInTool/definitions';
import { isMetaToolPart, META_TOOL_TITLE_KEYS, type MetaToolName } from './metaTool/metaToolState';
import { getToolName, type ToolMessagePart } from './toolPartState';

type ToolRenderer = (part: ToolMessagePart) => ReactNode;
type ToolPresentation = {
  renderTool: ToolRenderer;
  getToolTitle: (name: string) => string;
};
const ToolRendererContext = createContext<ToolRenderer | null>(null);
const ToolTitleContext = createContext<ToolPresentation['getToolTitle'] | null>(null);

/** Lets a source own tool detail loading while keeping the shared process layout. */
export function ToolRendererProvider({
  children,
  renderTool,
  getToolTitle,
}: PropsWithChildren<ToolPresentation>) {
  return (
    <ToolRendererContext value={renderTool}>
      <ToolTitleContext value={getToolTitle}>{children}</ToolTitleContext>
    </ToolRendererContext>
  );
}

export function useToolRenderer() {
  return use(ToolRendererContext);
}

export function useToolTitle() {
  const getSourceTitle = use(ToolTitleContext);
  const { t } = useTranslation();
  return (part: ToolMessagePart) => {
    const name = getToolName(part);
    if (getSourceTitle) return getSourceTitle(name);
    const titleKey =
      builtInToolDefinitions[name]?.titleKey ??
      (isMetaToolPart(part) ? META_TOOL_TITLE_KEYS[name as MetaToolName] : undefined);
    return titleKey ? t(titleKey) : part.title?.trim() || name;
  };
}
