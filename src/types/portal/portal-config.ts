import { err, Result } from 'neverthrow';
import { UrlPath } from '../file/urlPath.js';
import { AiConfig } from './config/ai-config.js';
import { BrandConfig, ColorMode } from './config/brand-config.js';
import { allOf, isJsonObject, unknownKeys } from './config/fields.js';
import { Link } from './config/link.js';
import { NavigationConfig } from './config/navigation-config.js';
import { SiteConfig, SuggestedSite } from './config/site-config.js';
import { StaticAsset } from './config/static-asset.js';

export interface PortalLink {
  label: string;
  url: string;
  /** Whether it leaves the portal, which opens it in a new tab. */
  external: boolean;
}

/**
 * What the browser bundle is told about the portal, written to `portal.identity.json`. Nothing
 * here may address the machine the portal was built on. `portal-template/src/lib/portal-types.ts`
 * declares the same type, and test/portal-template.test.ts holds the two equal.
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
  colorMode: ColorMode;
  links: PortalLink[];
  /** Whether each page offers to open itself in an external AI assistant. */
  pageActions: boolean;
}

const BLOCK = 'portal';

const NAMESPACES = ['site', 'brand', 'navigation', 'ai'];

export class PortalConfig {
  private constructor(
    private readonly site: SiteConfig,
    private readonly brand: BrandConfig,
    private readonly navigation: NavigationConfig,
    private readonly ai: AiConfig
  ) {}

  /** The block quickstart writes: the specification's own name and description, and every default spelled out. */
  public static scaffolded(site: SuggestedSite): PortalConfig {
    return new PortalConfig(
      SiteConfig.suggested(site),
      BrandConfig.defaults,
      NavigationConfig.defaults,
      AiConfig.defaults
    );
  }

  /**
   * `block` is whatever the file holds under `portal`. `suggested` is what the only specification
   * says about itself, or null when there are several; it fills the site's name and description
   * when the block leaves them out.
   */
  public static fromBlock(block: unknown, suggested: SuggestedSite | null): Result<PortalConfig, string[]> {
    if (block === undefined) {
      return err([`'${BLOCK}' is required.`]);
    }
    if (!isJsonObject(block)) {
      return err([`'${BLOCK}' must be a JSON object.`]);
    }

    // Each parser hands back the value it accepted, so the constructor is fed only what
    // validation proved.
    return allOf(
      unknownKeys(block, NAMESPACES, BLOCK),
      Result.combineWithAllErrors([
        SiteConfig.parse(block.site, `${BLOCK}.site`, suggested),
        BrandConfig.parse(block.brand, `${BLOCK}.brand`),
        NavigationConfig.parse(block.navigation, `${BLOCK}.navigation`),
        AiConfig.parse(block.ai, `${BLOCK}.ai`)
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

  public aiSettings(): AiConfig {
    return this.ai;
  }

  public staticFiles(): StaticAsset[] {
    return this.brand.files();
  }

  public identity(): PortalIdentity {
    const origin = this.site.origin();
    const logo = this.brand.logoImages();
    const favicon = this.brand.faviconImage();
    return {
      name: this.site.siteName(),
      description: this.site.siteDescription(),
      siteUrl: origin === null ? null : origin.toString(),
      logo: logo === null ? null : { light: logo.light().siteUrl(), dark: logo.dark().siteUrl() },
      favicon: favicon === null ? null : { url: favicon.siteUrl(), type: favicon.imageType() },
      colorMode: this.brand.mode(),
      links: this.navigation.headerLinks().map(portalLink),
      pageActions: this.ai.offersPageActions()
    };
  }

  /** Every namespace included, defaults and all, which is what quickstart writes. */
  public toJSON(): PortalBlock {
    return {
      site: this.site.toJSON(),
      brand: this.brand.toJSON(),
      navigation: this.navigation.toJSON(),
      ai: this.ai.toJSON()
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
  ai: ReturnType<AiConfig['toJSON']>;
}
