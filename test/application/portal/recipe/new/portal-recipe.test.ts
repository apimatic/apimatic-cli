import { expect } from "chai";
import { PortalRecipe } from "../../../../../src/application/portal/recipe/portal-recipe";

describe("PortalRecipe", () => {
  it("should initialize with the correct name and empty steps", () => {
    const recipe = new PortalRecipe("Test Recipe");
    const serializable = recipe.toSerializableRecipe();
    expect(serializable.name).to.equal("Test Recipe");
    expect(serializable.steps).to.be.an("array").that.is.empty;
  });

  it("should add a content step with correct structure", () => {
    const recipe = new PortalRecipe("Test Recipe");
    recipe.addContentStep("step1", "Step 1", "Some content");
    const serializable = recipe.toSerializableRecipe();
    expect(serializable.steps).to.have.lengthOf(1);
    expect(serializable.steps[0]).to.deep.equal({
      key: "step1",
      name: "Step 1",
      type: "content",
      config: { content: "Some content" }
    });
  });

  it("should add an endpoint step with correct structure", () => {
    const recipe = new PortalRecipe("Test Recipe");
    recipe.addEndpointStep("step2", "Step 2", "desc", "permalink");
    const serializable = recipe.toSerializableRecipe();
    expect(serializable.steps).to.have.lengthOf(1);
    expect(serializable.steps[0]).to.deep.equal({
      key: "step2",
      name: "Step 2",
      type: "endpoint",
      config: { description: "desc", endpointPermalink: "permalink" }
    });
  });

  it("should allow chaining of addContentStep and addEndpointStep", () => {
    const recipe = new PortalRecipe("Test Recipe");
    recipe
      .addContentStep("step1", "Step 1", "Some content")
      .addEndpointStep("step2", "Step 2", "desc", "permalink");
    const serializable = recipe.toSerializableRecipe();
    expect(serializable.steps).to.have.lengthOf(2);
    expect(serializable.steps[0].type).to.equal("content");
    expect(serializable.steps[1].type).to.equal("endpoint");
  });

  it("toSerializableRecipe should return the correct recipe object", () => {
    const recipe = new PortalRecipe("Test Recipe");
    recipe.addContentStep("step1", "Step 1", "Some content");
    const serializable = recipe.toSerializableRecipe();
    expect(serializable).to.have.property("name", "Test Recipe");
    expect(serializable).to.have.property("steps").that.is.an("array");
  });
});
