export type MarketplaceText = { en: string; zh: string | null };

export type CherryinSkill = {
  id: string;
  name: MarketplaceText;
  description: MarketplaceText;
  author: string;
  version: string;
  tags: string[];
  mobileSupport: 'supported' | 'unsupported';
  downloads: number;
  hasPackage: boolean;
  packageSize: number | null;
  sourceUrl: string | null;
};

export type CherryinSkillDetail = CherryinSkill & { longDescription: MarketplaceText };
export type CherryinSkillLibraryDetail = CherryinSkillDetail & {
  installed: { skillId: string; name: string; entryPath: string }[];
};
export type CherryinSkillQuery = {
  query?: string;
  offset?: number;
};
export type CherryinSkillPage = {
  items: CherryinSkill[];
  nextOffset: number | null;
};
