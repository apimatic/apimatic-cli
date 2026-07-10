import { expect } from "chai";
import { PortalRecipe } from "../../../../../src/application/portal/recipe/portal-recipe";

describe("PortalRecipe", () => {
  it("should initialize with the correct name and empty steps", () => {
    const recipe = new PortalRecipe("Test Recipe");
    const serializable = recipe.toSerializableRecipe();
    expect(serializable.name).to.equal("Test Recipe");
    expect(serializable.steps).to.be.an("array").that.is.empty;
  });

  it("toSerializableRecipe should return the correct recipe object", () => {
    const recipe = new PortalRecipe("Test Recipe");
    recipe.addContentStep("step1", "Step 1", "Some content");
    const serializable = recipe.toSerializableRecipe();
    expect(serializable).to.have.property("name", "Test Recipe");
    expect(serializable).to.have.property("steps").that.is.an("array");
  });
});
