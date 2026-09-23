import { err, Result } from 'neverthrow';
import { UrlPath } from '../file/urlPath.js';
import { AdvancedTokens } from './config/advanced-tokens.js';
import { AiConfig } from './config/ai-config.js';
import { ApiConfig } from './config/api-config.js';
import { BrandConfig, ColorMode } from './config/brand-config.js';
import { allOf, isJsonObject, unknownKeys } from './config/fields.js';
import { HomeConfig } from './config/home-config.js';
import { Link } from './config/link.js';
import { Layout, NavigationConfig } from './config/navigation-config.js';
import { SiteConfig, SuggestedSite } from './config/site-config.js';
import { StaticAsset } from './config/static-asset.js';

/** A link in the portal's chrome, as the browser renders it. */
export interface PortalLink {
  label: string;
  url: string;
  /** Whether it leaves the portal, which opens it in a new tab. */
  external: boolean;
}

/**
 * What the browser bundle is told about the portal, written to `portal.identity.json`. Nothing
 * here may address the machine the portal was built on; `portal-template/src/lib/portal.ts`
 * declares the same fields.
 */
export interface PortalIdentity {
  name: string;
  description: string | null;
  /** Origin only, with no trailing slash. */
  siteUrl: string | null;
  /** Site-relative, one per colour mode; the same URL twice when one image serves both. */
  logo: { light: string; dark: string } | null;
  /** Site-relative, with the image type its extension names, when it names one. */
  favicon: { url: string; type: string | null } | null;
  /** The Google Fonts stylesheet, or null when both families are the system's own. */
  fontsUrl: string | null;
  layout: Layout;
  colorMode: ColorMode;
  links: PortalLink[];
  homeCta: PortalLink | null;
  /** Whether each page offers to open itself in an external AI assistant. */
  pageActions: boolean;
}

/** The block as a message names it: every setting's path starts with it. */
const BLOCK = 'portal';

const NAMESPACES = ['site', 'brand', 'navigation', 'home', 'api', 'ai', 'advanced'];

// Immutable wrapper around the `portal` block of `src/apimatic.json`. User input goes through
// `fromBlock`, which names every invalid setting; a new project's block comes from `scaffolded`.
export class PortalConfig {
  private constructor(
    private readonly site: SiteConfig,
    private readonly brand: BrandConfig,
    private readonly navigation: NavigationConfig,
    private readonly home: HomeConfig,
    private readonly api: ApiConfig,
    private readonly ai: AiConfig,
    private readonly advanced: AdvancedTokens
  ) {}

  /** The block quickstart writes: the specification's own name and description, and every default spelled out. */
  public static scaffolded(site: SuggestedSite): PortalConfig {
    return new PortalConfig(
      SiteConfig.suggested(site),
      BrandConfig.defaults,
      NavigationConfig.defaults,
      HomeConfig.defaults,
      ApiConfig.defaults,
      AiConfig.defaults,
      AdvancedTokens.defaults
    );
  }

  /**
   * The `portal` block as the document parser hands it over, which is whatever the file holds
   * under that key. `suggested` is what the only specification says about itself, or null when
   * there are several; it fills the site's name and description when the block leaves them out.
   */
  public static fromBlock(block: unknown, suggested: SuggestedSite | null): Result<PortalConfig, string[]> {
    if (block === undefined) {
      return err([`'${BLOCK}' is required.`]);
    }
    if (!isJsonObject(block)) {
      return err([`'${BLOCK}' must be a JSON object.`]);
    }

    // Every setting is reported at once rather than stopping at the first, so one edit fixes
    // the file. Each parser hands back the value it accepted, so the constructor below is fed
    // only what validation proved.
    return allOf(
      unknownKeys(block, NAMESPACES, BLOCK),
      Result.combineWithAllErrors([
        SiteConfig.parse(block.site, `${BLOCK}.site`, suggested),
        BrandConfig.parse(block.brand, `${BLOCK}.brand`),
        NavigationConfig.parse(block.navigation, `${BLOCK}.navigation`),
        HomeConfig.parse(block.home, `${BLOCK}.home`),
        ApiConfig.parse(block.api, `${BLOCK}.api`),
        AiConfig.parse(block.ai, `${BLOCK}.ai`),
        AdvancedTokens.parse(block.advanced, `${BLOCK}.advanced`)
      ])
    ).map((namespaces) => new PortalConfig(...namespaces));
  }

  public siteTitle(): string {
    return this.site.siteName();
  }

  public siteDescription(): string | null {
    return this.site.siteDescription();
  }

  public siteOrigin(): UrlPath | null {
    return this.site.origin();
  }

  public brandSettings(): BrandConfig {
    return this.brand;
  }

  public navigationSettings(): NavigationConfig {
    return this.navigation;
  }

  public homeSettings(): HomeConfig {
    return this.home;
  }

  public apiSettings(): ApiConfig {
    return this.api;
  }

  public aiSettings(): AiConfig {
    return this.ai;
  }

  public tokenOverrides(): AdvancedTokens {
    return this.advanced;
  }

  /** Every file the block names under `static/`, each once; each knows the setting that names it. */
  public staticFiles(): StaticAsset[] {
    return this.brand.files();
  }

  public identity(): PortalIdentity {
    const origin = this.site.origin();
    const logo = this.brand.logoImages();
    const favicon = this.brand.faviconImage();
    const cta = this.home.callToAction();
    return {
      name: this.site.siteName(),
      description: this.site.siteDescription(),
      siteUrl: origin === null ? null : origin.toString(),
      logo: logo === null ? null : { light: logo.light().siteUrl(), dark: logo.dark().siteUrl() },
      favicon: favicon === null ? null : { url: favicon.siteUrl(), type: favicon.imageType() },
      fontsUrl: this.brand.brandFonts().googleFontsUrl(),
      layout: this.navigation.layoutName(),
      colorMode: this.brand.mode(),
      links: this.navigation.headerLinks().map(portalLink),
      homeCta: cta === null ? null : portalLink(cta),
      pageActions: this.ai.offersPageActions()
    };
  }

  /** The block as plain data, every namespace included, which is what quickstart writes. */
  public toJSON(): PortalBlock {
    return {
      site: this.site.toJSON(),
      brand: this.brand.toJSON(),
      navigation: this.navigation.toJSON(),
      home: this.home.toJSON(),
      api: this.api.toJSON(),
      ai: this.ai.toJSON(),
      advanced: this.advanced.toJSON()
    };
  }
}

function portalLink(link: Link): PortalLink {
  return { label: link.text(), url: link.href(), external: link.isExternal() };
}

export interface PortalBlock {
  site: ReturnType<SiteConfig['toJSON']>;
  brand: ReturnType<BrandConfig['toJSON']>;
  navigation: ReturnType<NavigationConfig['toJSON']>;
  home: ReturnType<HomeConfig['toJSON']>;
  api: ReturnType<ApiConfig['toJSON']>;
  ai: ReturnType<AiConfig['toJSON']>;
  advanced: ReturnType<AdvancedTokens['toJSON']>;
}
