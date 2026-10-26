/** A save the preview refused, so that the first one it accepts after it, and only that one, is said to fix it. */
export class PreviewRefusal {
  private refused = false;

  public refuse(): void {
    this.refused = true;
  }

  /** Whether this accepted save fixes one refused before it. */
  public accept(): boolean {
    const fixed = this.refused;
    this.refused = false;
    return fixed;
  }
}
