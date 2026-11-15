import type { JSX } from 'react';
import type { BlazonData } from '../../types/index.js';
import { ColorsPage } from '@/pages/colors';
import { TypographyPage } from '@/pages/typography';
import { DimensionsPage } from '@/pages/dimensions';
import { TokensPage } from '@/pages/tokens';
import { MotionPage } from '@/pages/motion';
import { EffectsPage } from '@/pages/effects';

/** Token pages by route hash, so a new page needs an entry here and in TOKEN_PAGES, not an App edit. */
export const TOKEN_VIEWS: Record<string, (props: { data: BlazonData }) => JSX.Element> = {
  '#tokens/colors': ColorsPage,
  '#tokens/typography': TypographyPage,
  '#tokens/dimensions': DimensionsPage,
  '#tokens/motion': MotionPage,
  '#tokens/effects': EffectsPage,
  '#tokens/all': TokensPage,
};
