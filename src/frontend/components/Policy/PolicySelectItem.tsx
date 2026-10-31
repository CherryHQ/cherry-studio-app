import {
  Section,
  type SectionItemComponent,
  type SectionItemPressProps,
  type SectionSelectItemProps,
} from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { withPolicy } from './withPolicy';

type PolicySelectItemProps = SectionSelectItemProps &
  SectionItemPressProps & {
    /** Nothing is chosen yet; a locked row then says so instead of inviting a choice. */
    empty?: boolean;
    /** The policy field the row edits. */
    field: string;
  };

function SelectItem({ empty = false, field: _field, value, ...props }: PolicySelectItemProps) {
  const { t } = useTranslation();
  const shown: ReactNode =
    empty && props.locked ? (
      <Text className="text-base text-muted-foreground">
        {t('settings.provider.config.notSet')}
      </Text>
    ) : (
      value
    );
  return <Section.SelectItem {...props} value={shown} />;
}

/** A selection row that renders locked once the policy locks its field. */
export const PolicySelectItem = Object.assign(
  withPolicy(SelectItem, (policy, { field }) => ({
    locked: policy.canEdit(field) ? undefined : true,
  })),
  { sectionItem: true } satisfies SectionItemComponent,
);
