import {
  STANDARD_LOGO_LOCKUPS,
  STANDARD_SECTION_IDS,
  STANDARD_SECTION_TITLES,
  STANDARD_USAGE_ROLES,
  type BlazonConfig,
  type SectionInfo,
  type Vocabulary,
} from '../../types/index.js';

/**
 * What a value may name: the standard lockups, usage roles and sections, then the brand's additions (RFC 0002 §1).
 * The config must already have been checked, so every addition is a valid, unrepeated name.
 */
export function resolveVocabulary(config: Pick<BlazonConfig, 'customSections' | 'vocabulary'>): { vocabulary: Vocabulary; sections: SectionInfo[] } {
  return {
    vocabulary: {
      lockups: [...STANDARD_LOGO_LOCKUPS, ...(config.vocabulary?.lockups ?? [])],
      usageRoles: [...STANDARD_USAGE_ROLES, ...(config.vocabulary?.usageRoles ?? [])],
    },
    sections: [
      ...STANDARD_SECTION_IDS.map((id): SectionInfo => ({ id, title: STANDARD_SECTION_TITLES[id], standard: true })),
      ...(config.customSections ?? []).map(({ id, title }): SectionInfo => ({ id, title, standard: false })),
    ],
  };
}
