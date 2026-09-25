import { defaultStability, Language, Stability } from './generate.js';

/** The level a run generates at, and whether the caller named it or took what the language offers. */
export class StabilityChoice {
  private constructor(private readonly level: Stability, private readonly chosen: boolean) {}

  /** An absent flag is not a level: the language's own is the only one its generator accepts. */
  public static for(language: Language, flagValue: string | undefined): StabilityChoice {
    return flagValue === undefined
      ? new StabilityChoice(defaultStability(language), false)
      : new StabilityChoice(flagValue as Stability, true);
  }

  public stabilityLevel(): Stability {
    return this.level;
  }

  /** The publishing summary names the level only when it was asked for. */
  public chosenLevel(): Stability | undefined {
    return this.chosen ? this.level : undefined;
  }
}
