import portalConfig from '../../portal.config.json';

export const portal = {
  title: portalConfig.title as string,
  description: (portalConfig.description ?? null) as string | null,
  logoUrl: (portalConfig.logoUrl ?? null) as string | null,
  siteUrl: (portalConfig.siteUrl ?? null) as string | null,
  specs: portalConfig.specs as Record<string, string>,
};
